/** A fake fetch for adapter tests: records every call and answers with a fixed reply. Makes no network call. */
export interface FakeCall {
  url: string;
  init: RequestInit;
}

export function fakeFetch(reply: { status?: number; body: unknown } | { fail: Error }): { fetchFn: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if ("fail" in reply) throw reply.fail;
    return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

/** Header value from a RequestInit, case-insensitive. */
export function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}
