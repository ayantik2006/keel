// Test stand-in for next/headers. The HTTP test backend runs each request
// inside globalThis.__testALS so concurrent requests keep their own headers.
export async function headers() {
  const store = globalThis.__testALS?.getStore();
  return store?.headers ?? new Headers(globalThis.__testHeaders ?? {});
}
