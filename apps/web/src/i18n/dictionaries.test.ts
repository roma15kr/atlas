import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ru } from './ru';
import { uk } from './uk';

type Tree = { [key: string]: string | Tree };
/** Every leaf as «namespace.path» → text. */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((all, [key, value]) =>
    ({ ...all, ...(typeof value === 'string' ? { [`${prefix}${key}`]: value } : flatten(value, `${prefix}${key}.`)) }), {});
}
const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((match) => match[1]).sort();

describe('dictionaries', () => {
  const source = flatten(uk as unknown as Tree);
  for (const [name, dictionary] of Object.entries({ ru, en })) {
    const translated = flatten(dictionary as unknown as Tree);
    it(`${name} has exactly the Ukrainian keys`, () => {
      expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort());
    });
    it(`${name} keeps every placeholder of the Ukrainian text`, () => {
      for (const [key, text] of Object.entries(source)) expect({ key, placeholders: placeholders(translated[key] ?? '') }).toEqual({ key, placeholders: placeholders(text) });
    });
    it(`${name} has no empty texts`, () => {
      expect(Object.entries(translated).filter(([, text]) => !text.trim()).map(([key]) => key)).toEqual([]);
    });
  }
});
