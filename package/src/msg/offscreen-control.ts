/* These messages appear only in the single offscreen root control channel. */

interface OffscreenControlMap {
	"new-Worker": {
		workerId: string;
		params: ConstructorParameters<typeof Worker>;
	};
}

export type OffscreenControlType = keyof OffscreenControlMap;

export interface OffscreenControl<T extends string = OffscreenControlType> {
	control: T;
	data: T extends OffscreenControlType ? OffscreenControlMap[T] : unknown;
}

export const isOffscreenControl = (
	message: unknown,
): message is OffscreenControl =>
	typeof message === "object" &&
	message != null &&
	"control" in message &&
	typeof message.control === "string" &&
	"data" in message &&
	typeof message.data === "object" &&
	message.data != null;

export const hasValidOffscreenControlData = <
	T extends OffscreenControlType,
>(message: {
	control: T | string;
	data: unknown;
}): message is OffscreenControl<T> => {
	if (typeof message.data !== "object" || message.data == null) {
		return false;
	}

	const { control, data } = message;
	switch (control) {
		case "new-Worker":
			return isNewWorkerControlData(data);
		default:
			return false;
	}
};

export const validOffscreenControlData = <T extends OffscreenControlType>(
	type: T,
	message: OffscreenControl<string>,
): OffscreenControl<T>["data"] => {
	if (message.control !== type || !hasValidOffscreenControlData<T>(message)) {
		throw new TypeError("invalid OffscreenRootControl");
	}
	return message.data;
};

const isNewWorkerControlData = (
	data: object,
): data is OffscreenControlMap["new-Worker"] =>
	"workerId" in data &&
	typeof data.workerId === "string" &&
	"params" in data &&
	Array.isArray(data.params) &&
	isNewWorkerConstructorParams(data.params);

const isNewWorkerConstructorParams = (
	params: unknown,
): params is ConstructorParameters<typeof Worker> => {
	if (Array.isArray(params) && params.length === 2) {
		const [scriptURL, options] = params as [unknown, unknown];
		return (
			typeof scriptURL === "string" &&
			options != null &&
			typeof options === "object" &&
			isNewWorkerOptions(options)
		);
	}
	return false;
};

const isNewWorkerOptions = (opt: NonNullable<object>): opt is WorkerOptions =>
	Object.entries(opt).every(([key, value]) => {
		switch (key as keyof WorkerOptions) {
			case "credentials":
				return (
					value == null ||
					["include", "omit", "same-origin"].includes(value as string)
				);
			case "name":
				return value == null || typeof value === "string";
			case "type":
				return value == null || ["classic", "module"].includes(value as string);
			default:
				return false;
		}
	});
