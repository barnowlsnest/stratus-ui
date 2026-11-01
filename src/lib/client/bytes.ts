export const b64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const toText = (b: Uint8Array): string => new TextDecoder().decode(b);

export const toHex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(" ");

export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** One line of a payload for the record list: control characters become spaces. */
export const preview = (text: string): string => text.replace(/[\u0000-\u001f]+/g, " ");

export const sizeLabel = (n: number): string => `${n} B`;

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
export const clock = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
export const clockMs = (d: Date): string => `${clock(d)}.${pad(d.getMilliseconds(), 3)}`;

export function download(name: string, data: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
