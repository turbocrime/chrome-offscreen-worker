import type { OffscreenControl } from "./msg/offscreen-control.js";

const debug = globalThis.__DEV__ ? console.debug : () => null;

/**
 * This is a utility class which manages the offscreen document lifecycle and
 * and worker control channels, and it is not intended to be used directly.
 */
export class OffscreenSession {
	private controlPort?: Promise<chrome.runtime.Port>;

	private abort: AbortController["abort"];
	private signal: AbortSignal;
	private sessionId = crypto.randomUUID();
	private workers = new Map<string, AbortController>();

	constructor(
		private offscreenParams: chrome.offscreen.CreateParameters,
		private timeoutMs = 10_000,
	) {
		if (new URL(chrome.runtime.getURL(offscreenParams.url)).hash) {
			throw new Error("URL cannot contain a hash");
		}

		const ac = new AbortController();
		ac.signal.addEventListener("abort", () => this.reset());
		this.signal = ac.signal;
		this.abort = (r?: unknown) => ac.abort(r);
	}

	private init = () => {
		this.controlPort = undefined;
		this.workers.clear();
		this.sessionId = crypto.randomUUID();

		const ac = new AbortController();
		ac.signal.addEventListener("abort", () => this.reset());
		this.signal = ac.signal;
		this.abort = (r?: unknown) => ac.abort(r);
	};

	private reset = () => {
		debug("session reset");
		this.abort();
		this.controlPort?.then((p) => p.disconnect());
		for (const ac of this.workers.values()) {
			ac.abort();
		}
		this.init();
	};

	private createOffscreen() {
		this.controlPort ??= chrome.offscreen
			.createDocument(this.offscreenParams)
			.catch((e) => console.warn("Failed to create offscreen", e))
			.then(() => {
				const sessionPort = chrome.runtime.connect({
					name: `${chrome.runtime.getURL(this.offscreenParams.url)}#${this.sessionId}`,
				});
				debug(
					"createOffscreen connectPort sessionPort",
					sessionPort.name,
					sessionPort,
				);
				sessionPort.onDisconnect.addListener(this.abort);
				return sessionPort;
			});

		return this.controlPort;
	}

	public createWorker(
		...[scriptURL, workerOptions]: Required<
			ConstructorParameters<typeof Worker>
		>
	) {
		const workerId = crypto.randomUUID();
		const ac = new AbortController();
		this.workers.set(workerId, ac);

		const activeSession = this.createOffscreen();

		const newWorker: OffscreenControl<"new-Worker"> = {
			control: "new-Worker",
			data: { workerId, params: [String(scriptURL), workerOptions] },
		};

		const connectWorker = new Promise<chrome.runtime.Port>(
			(resolve, reject) => {
				debug("createWorker connectWorker", workerId);
				const abortInit = AbortSignal.any([
					ac.signal,
					AbortSignal.timeout(this.timeoutMs),
				]);
				const connectListener = (port: chrome.runtime.Port) => {
					if (port.name === workerId) {
						chrome.runtime.onConnect.removeListener(connectListener);
						resolve(port);
					}
				};
				chrome.runtime.onConnect.addListener(connectListener);
				abortInit.addEventListener("abort", () => {
					chrome.runtime.onConnect.removeListener(connectListener);
					reject(abortInit.reason);
				});
			},
		);

		void connectWorker.then(
			(workerPort) => {
				debug("createWorker connectWorker resolved", workerId, workerPort);
				workerPort.onDisconnect.addListener(() =>
					ac.abort("Worker port disconnected"),
				);
			},
			(cause) => {
				debug("createWorker connectWorker rejected", workerId, cause);
				ac.abort(cause);
			},
		);

		ac.signal.addEventListener("abort", () => {
			void connectWorker.then((p) => p.disconnect()).catch();
			this.workers.delete(workerId);
			if (!this.workers.size) {
				this.abort();
			}
		});

		activeSession
			.then((sessionPort) => {
				debug("createWorker activeSession postMessage", workerId, newWorker);
				sessionPort.postMessage(newWorker);
			})
			.catch(console.warn);
		//ac.abort(new Error("Failed to activate offscreen session", { cause })),

		return {
			port: connectWorker,
			abort: (r?: unknown) => {
				debug("createWorker return abort called");
				ac.abort(r);
			},
			signal: ac.signal,
		};
	}
}
