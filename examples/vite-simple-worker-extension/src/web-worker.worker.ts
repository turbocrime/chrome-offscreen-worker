/// <reference lib="webworker" />

console.log("web worker");

globalThis.addEventListener("message", (evt) =>
	globalThis.postMessage(evt.data),
);
