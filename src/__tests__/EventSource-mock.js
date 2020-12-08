import EventEmitter from 'events';

export default function EventSource(url) {
  this.__emitter = new EventEmitter();

  this.onerror = undefined;
  this.onopen = undefined;
  this.onmessage = undefined;
  this.readyState = EventSource.CONNECTING;

  this.addEventListener = addEventListener;
  this.removeEventListener = removeEventListener;
  this.close = close;

  this.mockUrl = url;
  this.mockEmit = mockEmit;
  this.mockError = mockError;
  this.mockOpen = mockOpen;
  this.mockMessage = mockMessage;

  function addEventListener(eventName, callback) {
    this.__emitter.on(eventName, callback);
  }

  function removeEventListener(eventName, callback) {
    this.__emitter.off(eventName, callback);
  }

  function close() {
    this.readyState = EventSource.CLOSED;
  }

  function mockEmit(eventName, param) {
    if (this.readyState !== EventSource.CLOSED) {
      this.__emitter.emit(eventName, param);
    }
  }

  function mockError(error) {
    if (this.readyState !== EventSource.CLOSED) {
      this.onerror && this.onerror(error);
    }
  }

  function mockOpen(error) {
    if (this.readyState === EventSource.CONNECTING) {
      this.readyState = EventSource.OPEN;
      this.onopen && this.onopen(error);
    }
  }

  function mockMessage(message) {
    if (this.readyState === EventSource.OPEN) {
      this.onmessage && this.onmessage(message);
    }
  }
}

EventSource.CONNECTING = 0;
EventSource.OPEN = 1;
EventSource.CLOSED = 2;
