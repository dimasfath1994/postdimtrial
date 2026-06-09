export function createVariables() {
  const store = {};

  return {
    set: (k, v) => store[k] = v,
    get: (k) => store[k],
    all: () => store
  };
}