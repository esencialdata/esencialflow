let timerId = null;
let remainingSeconds = 0;

self.onmessage = function(e) {
  const { command, seconds } = e.data;

  switch (command) {
    case 'start':
      if (timerId) {
        clearInterval(timerId);
      }
      remainingSeconds = seconds;
      self.postMessage({ type: 'tick', remainingSeconds });

      timerId = setInterval(() => {
        remainingSeconds--;
        self.postMessage({ type: 'tick', remainingSeconds });

        if (remainingSeconds <= 0) {
          clearInterval(timerId);
          timerId = null;
          self.postMessage({ type: 'done' });
        }
      }, 1000);
      break;

    case 'pause':
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      break;

    case 'stop':
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      remainingSeconds = 0;
      self.postMessage({ type: 'tick', remainingSeconds });
      break;
  }
};
