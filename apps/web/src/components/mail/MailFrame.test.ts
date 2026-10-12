import { describe, expect, it } from 'vitest';
import { frameContentHeight } from './MailParts';

const doc = (bodyHeight: number, rootHeight: number) => ({ body: { scrollHeight: bodyHeight }, documentElement: { scrollHeight: rootHeight } }) as unknown as Document;

describe('mail frame height', () => {
  it('follows the message body, not the frame-sized root', () => {
    // The root is as tall as the frame (600 px); a short message must still give a short frame.
    expect(frameContentHeight(doc(120, 600))).toBe(124);
  });

  it('settles instead of growing when measured again at its own height', () => {
    let height = 80;
    for (let i = 0; i < 20; i++) height = frameContentHeight(doc(120, Math.max(height, 120)))!;
    expect(height).toBe(124);
  });

  it('keeps between 40 px and the 4000 px cap, and waits for a document', () => {
    expect(frameContentHeight(doc(0, 900))).toBe(40);
    expect(frameContentHeight(doc(9000, 9000))).toBe(4000);
    expect(frameContentHeight(null)).toBeNull();
  });
});
