export const toErrorEventInit = ({
	colno,
	filename,
	lineno,
	message,
	error,
}: ErrorEvent): ErrorEventInit => ({
	colno,
	filename,
	lineno,
	message,
	error,
});

export const toMessageEventInit = ({
	data,
}: MessageEvent): MessageEventInit => ({
	data,
});

export const isMessageEventInit = (i: object): i is MessageEventInit =>
	"data" in i;

export const isErrorEventInit = (i: object): i is ErrorEventInit => {
	const { message, filename, lineno, colno, error }: Record<string, unknown> = {
		...i,
	};
	return (
		(message == null || typeof message === "string") &&
		(filename == null || typeof filename === "string") &&
		(lineno == null || typeof lineno === "number") &&
		(colno == null || typeof colno === "number") &&
		(error == null || Boolean(typeof error))
	);
};
