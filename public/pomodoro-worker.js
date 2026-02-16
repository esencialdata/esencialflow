let timerId = null;
let remainingSeconds = 0;

self.onmessage = function (e) {
  const { command, seconds } = e.data;

  switch (command) {
    case 'start':
      if (timerId) {
        clearInterval(timerId);
      }

      // We expect 'endTime' timestamp OR 'seconds' to calculate it
      // Standardize on using endTime for robustness.
      let targetTime = e.data.endTime;
      if (!targetTime && seconds) {
        targetTime = Date.now() + (seconds * 1000);
      }

      // Calculate initial remainder
      remainingSeconds = Math.max(0, Math.ceil((targetTime - Date.now()) / 1000));
      self.postMessage({ type: 'tick', remainingSeconds });

      // If it is already complete, emit done once and do not start interval
      if (remainingSeconds <= 0) {
        self.postMessage({ type: 'done' });
        break;
      }

      timerId = setInterval(() => {
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((targetTime - now) / 1000));

        remainingSeconds = diff;
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
      break;
  }
};
