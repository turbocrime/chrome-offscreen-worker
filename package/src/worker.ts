/// <reference types="serviceworker" />

const debug = globalThis.__DEV__ ? console.debug : () => null;

import { OffscreenSession } from "./session.js";
import {
	isWorkerEvent,
	validWorkerEventInit,
	type WorkerEvent,
} from "./msg/worker-event.js";

export class OffscreenWorker extends EventTarget implements Worker {
	private static session?: OffscreenSession;
	public static configure(
		...config: ConstructorParameters<typeof OffscreenSession>
	) {
		OffscreenWorker.session = new OffscreenSession(...config);
	}

	// user-assignable callback properties
	onerror: Worker["onerror"] = null;
	onmessage: Worker["onmessage"] = null;
	onmessageerror: Worker["onmessageerror"] = null;

	private workerParams: Required<ConstructorParameters<typeof Worker>>;
	private workerId?: string;
	private port: Promise<chrome.runtime.Port>;
	private abort: AbortController["abort"];
	private signal: AbortSignal;

	public constructor(
		...[scriptURL, options = {}]: ConstructorParameters<typeof Worker>
	) {
		if (!OffscreenWorker.session) {
			throw new Error(
				"The static configure method must be called before constructing an instance of this class.",
			);
		}

		super();

		this.workerParams = [
			scriptURL,
			{ name: `${this.constructor.name} ${Date.now()}`, ...options },
		];

		debug("OffscreenWorker workerParams set", ...this.workerParams);

		const { port, abort, signal } = OffscreenWorker.session.createWorker(
			...this.workerParams,
		);

		this.port = port;
		this.abort = abort;
		this.signal = signal;

		void this.port.then(
			(workerPort) => {
				debug(
					"OffscreenWorker connected",
					workerPort.name,
					this.workerParams[1],
				);
				this.workerId = workerPort.name;
				workerPort.onMessage.addListener(this.workerOutput);
			},
			(error: unknown) => {
				const failure = new Error("Failed to acquire worker port", {
					cause: error,
				});
				this.dispatchEvent(
					new ErrorEvent("error", { message: failure.message, error: failure }),
				);
			},
		);
	}

	/**
	 * Handles events from the offscreen worker, reconstructs events, and
	 * dispatches them to the caller.
	 */
	private workerOutput = (json: unknown, _: chrome.runtime.Port) => {
		debug("OffscreenWorker workerOutput", this.workerId, json);

		if (isWorkerEvent(json)) {
			const [event, init] = json;
			switch (event) {
				case "error": {
					const { colno, filename, lineno, message, error } =
						validWorkerEventInit(event, init);
					this.dispatchEvent(
						new ErrorEvent(event, {
							colno,
							filename,
							lineno,
							message,
							error,
						} satisfies ErrorEventInit),
					);
					return;
				}
				case "message":
				case "messageerror": {
					const { data } = validWorkerEventInit(event, init);
					this.dispatchEvent(
						new MessageEvent(event, { data } satisfies MessageEventInit),
					);
					return;
				}
				default:
					console.warn("Unknown event from worker", event, init);
					this.dispatchEvent(
						new MessageEvent("messageerror", {
							data: init,
						} satisfies MessageEventInit),
					);
					return;
			}
		}
	};

	/**
	 * Dispatches event input from the caller to the offscreen worker. Presently
	 * only supports `MessageEvent`.
	 *
	 * @todo other event types?
	 */
	private callerInput = (evt: Event) => {
		debug("OffscreenWorker callerInput", this.workerId, evt);

		switch (evt.type) {
			case "message": {
				const { data } = evt as MessageEvent<unknown>;
				const input: WorkerEvent<"message"> = ["message", { data }];
				void this.port
					.then((workerPort) => {
						debug(
							"OffscreenWorker callerInput port.postMessage",
							this.workerId,
							input,
						);
						workerPort.postMessage(input);
					})
					.catch((err) => {
						debug(
							"OffscreenWorker callerInput port.postMessage failed",
							this.workerId,
						);
						console.warn(err);
					});
				return;
			}
			case "error":
			case "messageerror":
				throw new Error("Unexpected event from caller", { cause: evt });
			default:
				throw new Error("Unknown event from caller", { cause: evt });
		}
	};

	public terminate() {
		debug("OffscreenWorker terminate", this.workerId);
		void this.abort("OffscreenWorker terminate");
		this.port = Promise.reject([
			"OffscreenWorker terminate",
			this.signal.reason,
		]);
	}

	public postMessage(
		data: unknown,
		options?: Transferable[] | StructuredSerializeOptions,
	) {
		debug("OffscreenWorker postMessage", this.workerId, data, options);

		// identify transferable objects
		const transfer = Array.isArray(options) ? options : options?.transfer;
		if (transfer?.length) {
			throw new Error("Transferable unimplemented", { cause: [data, options] });
		}

		this.callerInput(new MessageEvent("message", { data }));
	}

	//	public override dispatchEvent(event: Event): boolean {
	//		debug("OffscreenWorker dispatchEvent", this.workerId, event);
	//
	//		/**
	//		 * super dispatch only runs handlers attached via `addEventListener` so
	//		 * all the `on${event}` properties must be called by name.
	//		 *
	//		 * @todo these handlers might return a value?
	//		 */
	//		const handlerName: `on${string}` = `on${event.type}`;
	//		if (handlerName in this) {
	//			switch (handlerName) {
	//				case "onerror":
	//					/** @todo validate event */
	//					this[handlerName]?.(event as ErrorEvent);
	//					break;
	//				case "onmessage":
	//				case "onmessageerror":
	//					/** @todo validate event */
	//					this[handlerName]?.(event as MessageEvent);
	//					break;
	//				default: {
	//					/** @todo validate handler is function */
	//					(
	//						this[handlerName as keyof this] as
	//							| ((this: ThisType<this>, ev: Event) => unknown)
	//							| null
	//					)?.(event);
	//					break;
	//				}
	//			}
	//		}
	//
	//		return super.dispatchEvent(event);
	//	}
}
