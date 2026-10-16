import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useScrollBack } from './useScrollBack';

interface Props { firstId?: string; lastId?: string; lastIsMine?: boolean; hasMore: boolean; loadOlder?: () => Promise<void> }
let height = 1000;
function Harness(props: Props) {
  const history = useScrollBack(props);
  return <div>
    <div data-testid="box" ref={(element) => {
      history.container.current = element;
      if (element && !Object.getOwnPropertyDescriptor(element, 'scrollHeight')) {
        Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => height });
        Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => 400 });
      }
    }} onScroll={history.onScroll}><div ref={history.sentinel} /></div>
    {history.newBelow && <button type="button" onClick={history.scrollToEnd}>Новые сообщения ↓</button>}
    <button type="button" onClick={() => void history.older()}>older</button>
  </div>;
}
const box = () => screen.getByTestId('box');
const scrollTo = (top: number) => { box().scrollTop = top; fireEvent.scroll(box()); };

afterEach(() => { cleanup(); height = 1000; });

describe('useScrollBack', () => {
  it('opens on the newest message', () => {
    render(<Harness firstId="m1" lastId="m50" hasMore />);
    expect(box().scrollTop).toBe(1000);
  });

  it('stays on the newest message when an image above loads later', () => {
    render(<Harness firstId="m1" lastId="m50" hasMore />);
    expect(box().scrollTop).toBe(1000);
    height = 1240;
    const image = document.createElement('img');
    box().appendChild(image);
    fireEvent.load(image);
    expect(box().scrollTop).toBe(1240);
  });

  it('leaves a reader who scrolled back where they are when an image loads', () => {
    render(<Harness firstId="m1" lastId="m50" hasMore />);
    scrollTo(100);
    height = 1240;
    const image = document.createElement('img');
    box().appendChild(image);
    fireEvent.load(image);
    expect(box().scrollTop).toBe(100);
  });

  it('stays put and offers a jump when a message arrives while reading back', () => {
    const { rerender } = render(<Harness firstId="m1" lastId="m50" hasMore />);
    scrollTo(100);
    height = 1100;
    rerender(<Harness firstId="m1" lastId="m51" hasMore />);
    expect(box().scrollTop).toBe(100);
    fireEvent.click(screen.getByRole('button', { name: 'Новые сообщения ↓' }));
    expect(box().scrollTop).toBe(1100);
    expect(screen.queryByRole('button', { name: 'Новые сообщения ↓' })).not.toBeInTheDocument();
  });

  it('follows a new message when at the end, and always follows one of mine', () => {
    const { rerender } = render(<Harness firstId="m1" lastId="m50" hasMore />);
    height = 1100;
    rerender(<Harness firstId="m1" lastId="m51" hasMore />);
    expect(box().scrollTop).toBe(1100);
    scrollTo(100);
    height = 1200;
    rerender(<Harness firstId="m1" lastId="m52" lastIsMine hasMore />);
    expect(box().scrollTop).toBe(1200);
  });

  it('keeps the messages on screen in place when older ones load above', async () => {
    let props: Props = { firstId: 'm51', lastId: 'm100', hasMore: true, loadOlder: vi.fn() };
    const { rerender } = render(<Harness {...props} />);
    scrollTo(100); // 900px from the end
    props = { ...props, loadOlder: vi.fn(async () => { height = 1600; }) };
    rerender(<Harness {...props} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'older' })); });
    expect(props.loadOlder).toHaveBeenCalledTimes(1);
    rerender(<Harness {...props} firstId="m1" />);
    expect(box().scrollTop).toBe(700);
  });

  it('does not load when there is nothing older', async () => {
    const loadOlder = vi.fn(async () => undefined);
    render(<Harness firstId="m1" lastId="m10" hasMore={false} loadOlder={loadOlder} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'older' })); });
    expect(loadOlder).not.toHaveBeenCalled();
  });
});
