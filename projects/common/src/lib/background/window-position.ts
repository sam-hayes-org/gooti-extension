export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Place a popup so it stays inside a display work area.
 * Window coordinates from the browser can lie outside the screen Chrome
 * accepts, which makes windows.create fail.
 */
export function fitPopupBounds(
  popupWidth: number,
  popupHeight: number,
  anchor: WindowRect | undefined,
  workAreas: WindowRect[],
): WindowRect {
  const area = pickWorkArea(anchor, workAreas);
  if (!area) {
    return {
      width: popupWidth,
      height: popupHeight,
      left: anchor
        ? Math.round(anchor.left + (anchor.width - popupWidth) / 2)
        : 0,
      top: anchor
        ? Math.round(anchor.top + (anchor.height - popupHeight) / 2)
        : 0,
    };
  }

  const width = Math.min(popupWidth, area.width);
  const height = Math.min(popupHeight, area.height);
  const unclampedLeft = anchor
    ? anchor.left + (anchor.width - width) / 2
    : area.left + (area.width - width) / 2;
  const unclampedTop = anchor
    ? anchor.top + (anchor.height - height) / 2
    : area.top + (area.height - height) / 2;

  return {
    width: Math.round(width),
    height: Math.round(height),
    left: Math.round(
      clamp(unclampedLeft, area.left, area.left + area.width - width),
    ),
    top: Math.round(
      clamp(unclampedTop, area.top, area.top + area.height - height),
    ),
  };
}

function pickWorkArea(
  anchor: WindowRect | undefined,
  workAreas: WindowRect[],
): WindowRect | undefined {
  const areas = workAreas.filter((area) => area.width > 0 && area.height > 0);
  if (areas.length === 0) {
    return undefined;
  }
  if (!anchor) {
    return areas[0];
  }

  const centerX = anchor.left + anchor.width / 2;
  const centerY = anchor.top + anchor.height / 2;
  const containing = areas.find(
    (area) =>
      centerX >= area.left &&
      centerX < area.left + area.width &&
      centerY >= area.top &&
      centerY < area.top + area.height,
  );
  if (containing) {
    return containing;
  }

  return areas.reduce((nearest, area) => {
    const distance = centerDistance(centerX, centerY, area);
    const nearestDistance = centerDistance(centerX, centerY, nearest);
    return distance < nearestDistance ? area : nearest;
  });
}

function centerDistance(x: number, y: number, area: WindowRect): number {
  const dx = area.left + area.width / 2 - x;
  const dy = area.top + area.height / 2 - y;
  return dx * dx + dy * dy;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
