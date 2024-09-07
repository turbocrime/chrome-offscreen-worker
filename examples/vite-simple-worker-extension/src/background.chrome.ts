import { OffscreenWorker } from "@turbocrime/chrome-offscreen-worker/worker";

globalThis.Worker = OffscreenWorker;

OffscreenWorker.configure({
	url: "offscreen.html",
	reasons: [chrome.offscreen.Reason.WORKERS],
	justification: "Testing OffscreenWorker",
});

async function launchWorker() {
	const worker = new Worker(chrome.runtime.getURL("web-worker.worker.js"));

	const work = new Promise((resolve, reject) => {
		worker.addEventListener("message", (evt) => resolve(evt.data));
		worker.addEventListener("messageerror", (evt) =>
			reject(Error("MessageError", { cause: evt.data })),
		);
		worker.addEventListener("error", (evt) =>
			reject(evt.error ?? new Error(evt.message ?? "No message")),
		);
		setTimeout(() => reject("setTimeout"), 5000);
	}); //.finally(() => worker.terminate());

	worker.postMessage("Hello, World!");

	return work;
}

launchWorker().then(
	(...yay) => console.log("yay", ...yay),
	(...ohno) => console.error("ohno", ...ohno),
);
