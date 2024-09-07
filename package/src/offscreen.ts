/// <reference lib="dom" />

import {
	isOffscreenControl,
	type OffscreenControl,
	validOffscreenControlData,
} from "./msg/offscreen-control.js";
import {
	isWorkerEvent,
	validWorkerEventInit,
	type WorkerEvent,
	type WorkerEventType,
} from "./msg/worker-event.js";
import { toErrorEventInit, toMessageEventInit } from "./util/event-init.js";

const debug = globalThis.__DEV__ ? console.debug : () => null;

debug("offscreen init");

const sessions = new Map<
	chrome.runtime.Port["name"],
	Set<AbortController["abort"]>
>();

const sessionListener = (port: chrome.runtime.Port) => {
	debug("offscreen sessionListener", port.name);
	const [channelPath, sessionId] = port.name.split("#");
	const offscreenPath = window.location.href;
	if (sessionId && channelPath === offscreenPath) {
		debug("offscreen sessionListener accepted", sessionId);
		sessions.set(port.name, new Set());
		port.onDisconnect.addListener(detachSession);
		port.onMessage.addListener(controlSession);
	}
};

chrome.runtime.onConnect.addListener(sessionListener);
debug("offscreen addListener sessionListener");

const detachSession = (disconnectingPort: chrome.runtime.Port) => {
	const { name: sessionName } = disconnectingPort;
	const sessionWorkers = sessions.get(sessionName);

	if (!sessionWorkers) {
		throw new Error("Disconnecting session not found", {
			cause: disconnectingPort,
		});
	}

	try {
		for (const abort of sessionWorkers) {
			abort(`Port disconnected: ${sessionName}`);

			// TODO: is this necessary given the abort handler on each worker?
			sessionWorkers.delete(abort);
		}

		if (sessionWorkers.size) {
			throw new Error("Disconnecting session worker cleanup failed", {
				cause: {
					disconnectingPort,
					workers: sessionWorkers,
				},
			});
		}
	} finally {
		sessions.delete(sessionName);
		if (!sessions.size) {
			debug("offscreen no remaining sessions");
			window.close();
		}
	}
};

const controlSession = (json: unknown, sessionPort: chrome.runtime.Port) => {
	const { name: sessionName } = sessionPort;
	const workers = sessions.get(sessionName);

	if (!workers) {
		throw new Error("Session not found", { cause: sessionPort });
	}

	if (isOffscreenControl(json)) {
		switch (json.control) {
			case "new-Worker": {
				const { abort, signal } = actuallyConstructWorker(
					validOffscreenControlData("new-Worker", json),
				);
				workers.add(abort);
				signal.addEventListener("abort", () => workers.delete(abort));
				return;
			}
			default:
				throw new Error("Unknown message in offscreen control", {
					cause: json,
				});
		}
	}
};

/** Construct a worker with id and params provided by caller. */
const actuallyConstructWorker = ({
	workerId,
	params,
}: OffscreenControl<"new-Worker">["data"]) => {
	debug("offscreen actuallyConstructWorker", workerId, ...params);

	// connect back to caller
	const io = chrome.runtime.connect({ name: workerId });
	// actual construction
	const worker = new Worker(...params);
	// prepare abort control
	const ac = new AbortController();

	// listener methods	// handle event
	const workerEvent = <T extends WorkerEventType>(
		...eventJson: WorkerEvent<T>
	) => {
		debug("offscreen workerEvent", workerId, ...eventJson);
		try {
			io.postMessage(eventJson);
		} catch (cause) {
			ac.abort(new Error("Failed to output worker event", { cause }));
		}
	};

	// handle termination
	const workerTerminate = (reason?: unknown) => {
		debug("offscreen workerTerminate", workerId, reason);
		io.disconnect();
		worker.terminate();
	};

	ac.signal.addEventListener("abort", () => workerTerminate(ac.signal.reason));

	// serialize worker events, forward to caller
	worker.addEventListener("error", (evt) => {
		debug("error", evt);
		workerEvent("error", toErrorEventInit(evt));
	});
	worker.addEventListener("messageerror", (evt) => {
		debug("messageerror", evt);
		workerEvent("messageerror", toMessageEventInit(evt));
	});
	worker.addEventListener("message", (evt) => {
		debug("message", evt);
		workerEvent("message", toMessageEventInit(evt));
	});

	// abort worker when caller disconnects
	io.onDisconnect.addListener(() =>
		ac.abort(`Caller disconnected from ${workerId}`),
	);

	// forward caller input to worker
	io.onMessage.addListener((json: unknown) => {
		if (isWorkerEvent(json)) {
			const [event, init] = json;
			switch (event) {
				case "message": {
					const { data } = validWorkerEventInit("message", init);
					worker.postMessage(data);
					return;
				}
				default:
					throw new Error("Unexpected event from caller", { cause: json });
			}
		}
	});

	return ac;
};
