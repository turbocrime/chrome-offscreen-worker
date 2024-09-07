export class DummyWorker extends EventTarget implements Worker {
	onmessage: Worker["onmessage"] = null;
	onmessageerror: Worker["onmessageerror"] = null;
	onerror: Worker["onerror"] = null;

	// biome-ignore lint/suspicious/noExplicitAny: dummy
	constructor(...args: any[]) {
		super();

		console.log("new Worker", ...args);

		this.addEventListener("message", (evt) =>
			this.onmessage?.(evt as MessageEvent),
		);
		this.addEventListener("messageerror", (evt) =>
			this.onmessageerror?.(evt as MessageEvent),
		);
		this.addEventListener("error", (evt) => this.onerror?.(evt as ErrorEvent));

		setTimeout(
			() =>
				this.dispatchEvent(
					new MessageEvent("message", { data: "Hello, Dummy!" }),
				),
			1000,
		);
	}

	// biome-ignore lint/suspicious/noExplicitAny: dummy
	postMessage(...args: any[]) {
		console.log("Worker.postMessage", ...args);
	}

	terminate() {
		/* noop */
	}
}
