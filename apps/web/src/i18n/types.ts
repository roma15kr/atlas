/** The shape of a dictionary in another language: the same keys as the Ukrainian source, every leaf a string. */
export type Dictionary<T> = { [K in keyof T]: T[K] extends string ? string : Dictionary<T[K]> };
