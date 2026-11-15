import { hostFromTabUrl } from './active-tab';

describe('active tab host', () => {
  it('keeps the host and the port', () => {
    expect(hostFromTabUrl('https://primal.net/home')).toBe('primal.net');
    expect(hostFromTabUrl('https://www.primal.net/')).toBe('www.primal.net');
    expect(hostFromTabUrl('http://localhost:4200/app')).toBe('localhost:4200');
  });

  it('ignores an empty URL and a browser page', () => {
    expect(hostFromTabUrl('')).toBeNull();
    expect(hostFromTabUrl(undefined)).toBeNull();
    expect(hostFromTabUrl('chrome://extensions')).toBeNull();
    expect(hostFromTabUrl('about:blank')).toBeNull();
    expect(hostFromTabUrl('moz-extension://abc/index.html')).toBeNull();
    expect(hostFromTabUrl('chrome-extension://abc/index.html')).toBeNull();
  });
});
