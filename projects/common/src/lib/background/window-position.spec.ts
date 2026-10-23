import { fitPopupBounds, WindowRect } from './window-position';

describe('fitPopupBounds', () => {
  const screen: WindowRect = { left: 0, top: 0, width: 1920, height: 1080 };
  const rightScreen: WindowRect = {
    left: 1920,
    top: 0,
    width: 1280,
    height: 800,
  };

  it('pulls a popup back onto the nearest screen when the browser window is off screen', () => {
    const placed = fitPopupBounds(
      475,
      600,
      { left: 8000, top: 4000, width: 900, height: 700 },
      [screen],
    );

    expect(placed.width).toBe(475);
    expect(placed.height).toBe(600);
    expect(placed.left).toBeGreaterThanOrEqual(screen.left);
    expect(placed.top).toBeGreaterThanOrEqual(screen.top);
    expect(placed.left + placed.width).toBeLessThanOrEqual(
      screen.left + screen.width,
    );
    expect(placed.top + placed.height).toBeLessThanOrEqual(
      screen.top + screen.height,
    );
  });

  it('keeps the popup on the screen that contains the browser window', () => {
    const placed = fitPopupBounds(
      375,
      600,
      { left: 2000, top: 50, width: 1000, height: 700 },
      [screen, rightScreen],
    );

    expect(placed.left).toBeGreaterThanOrEqual(rightScreen.left);
    expect(placed.left + placed.width).toBeLessThanOrEqual(
      rightScreen.left + rightScreen.width,
    );
    expect(placed.top + placed.height).toBeLessThanOrEqual(
      rightScreen.top + rightScreen.height,
    );
  });

  it('shrinks a popup that is taller than the work area', () => {
    const short: WindowRect = { left: 10, top: 20, width: 800, height: 400 };
    const placed = fitPopupBounds(475, 600, undefined, [short]);

    expect(placed.height).toBe(400);
    expect(placed.top).toBe(20);
    expect(placed.left).toBeGreaterThanOrEqual(10);
  });

  it('still centers on the browser window when no screen info is available', () => {
    const placed = fitPopupBounds(
      100,
      80,
      { left: 200, top: 100, width: 400, height: 300 },
      [],
    );

    expect(placed).toEqual({ left: 350, top: 210, width: 100, height: 80 });
  });
});
