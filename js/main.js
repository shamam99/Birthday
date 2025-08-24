// iOS-safe starter + sequence controller + balloon spawner
(() => {
    const stage = document.querySelector('.stage');
    const overlay = document.getElementById('startOverlay');
    const bgAudioEl = document.getElementById('birthday-audio'); // inside the cake block
    const balloonsWrap = document.querySelector('.balloons');
  
    // ----- tweakables -----
    const INITIAL_BALLOONS = 12;   
    const SPAWN_EVERY_MS   = 400;  // how often to add a new balloon
    const BALLOON_TTL_MS   = 3000; // remove each balloon after this long (ms)
    // ----------------------
  
    // sequence timings (kept from your file; titles can be absent in HTML)
    const T_BALLOONS = 0;
    const T_TITLES   = 2600;
    const T_CAKE     = 4200;
    const T_NAME     = 5200;
  
    let spawnTimer = null;
  
    function rand(min, max) { return Math.random() * (max - min) + min; }
  
    function createBalloon(initialDelaySec = 0) {
      if (!balloonsWrap) return;
      const img = document.createElement('img');
      img.src = 'img/ballon.png';
      img.alt = '';
      img.className = 'balloon';
  
      // randomize position/size/rotation/delay so they cover the whole screen
      const x = Math.round(rand(4, 64)) + '%';                   // across the width
      const w = Math.round(rand(26, 68)) + '%';                  // width %
      const s = rand(0.9, 1.4).toFixed(2);                       // scale
      const rot = rand(-6, 6).toFixed(1) + 'deg';                // tiny tilt
      const delay = (initialDelaySec + rand(0, 2.2)).toFixed(2) + 's';
  
      img.style.setProperty('--x', x);
      img.style.setProperty('--w', w);
      img.style.setProperty('--s', s);
      img.style.setProperty('--r', rot);
      img.style.setProperty('--d', delay);
  
      balloonsWrap.appendChild(img);
  
      // clean up after a while to keep DOM light
      setTimeout(() => img.remove(), BALLOON_TTL_MS);
    }
  
    function seedBalloons(n) {
      if (!balloonsWrap) return;
      balloonsWrap.innerHTML = '';       // clear any static balloons in HTML
      for (let i = 0; i < n; i++) createBalloon(0);
    }
  
    function startSpawner() {
      if (spawnTimer) clearInterval(spawnTimer);
      spawnTimer = setInterval(() => createBalloon(0), SPAWN_EVERY_MS);
    }
    function stopSpawner() {
      if (spawnTimer) { clearInterval(spawnTimer); spawnTimer = null; }
    }
  
    function startSequence() {
      // mark started (balloons animate via CSS)
      stage.classList.add('started');
  
      // these are no-ops if titles/name aren’t in your HTML
      setTimeout(() => stage.classList.add('show-titles'), T_TITLES);
      setTimeout(() => stage.classList.add('show-cake'),   T_CAKE);
      setTimeout(() => stage.classList.add('show-name'),   T_NAME);
    }
  
    async function unlockAudio() {
      // pre-unlock audio so later play() works on iOS
      if (!bgAudioEl) return;
      try {
        bgAudioEl.muted = true;
        await bgAudioEl.play();
        bgAudioEl.pause();
        bgAudioEl.currentTime = 0;
        bgAudioEl.muted = false;
      } catch (e) {
        console.warn('Audio unlock failed (will retry on candle):', e);
      }
    }
  
    overlay.addEventListener('click', async () => {
      overlay.classList.add('hide');
  
      // balloons across the whole screen
      seedBalloons(INITIAL_BALLOONS);
      startSpawner();
  
      await unlockAudio();
      startSequence();
  
      if (navigator.vibrate) navigator.vibrate(10);
    });
  
    // optional: pause/resume spawner when tab hidden/visible
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopSpawner();
      else if (stage.classList.contains('started')) startSpawner();
    });
  })();
  