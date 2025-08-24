window.onload = function() {
    const canvas = document.getElementById('cake-candle-canvas');
    const ctx = canvas.getContext('2d');
  
    // canvas size
    canvas.width = 50;
    canvas.height = 100;
  
    let flameOn = true;
    let blowing = false;
    let shakeFrame = 0;
    let flameAngle = 0;
    let smokes = [];
    let showCard = false;
    let isBlowDetected = false;
    let flameSize = 1.0;
    let blowIntensity = 0;
  
    // ---------- NEW: mic-level detector (Web Audio) ----------
    let audioCtx = null, analyser = null, freqAnalyser = null, micSource = null, micStream = null;
    let timeData = null, freqData = null, micRaf = null;
    let emaRms = 0.01;         // exponential moving avg of background
    const EMA_ALPHA = 0.05;    // smoothing factor
    let lastBlowAt = 0;        // throttle reactions
    const COOLDOWN_MS = 120;
  
    async function startMicMonitor() {
      if (audioCtx) return; // already running
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        micSource = audioCtx.createMediaStreamSource(micStream);
  
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
  
        // separate node for frequency-domain so time-domain window isn't disturbed
        freqAnalyser = audioCtx.createAnalyser();
        freqAnalyser.fftSize = 2048;
  
        micSource.connect(analyser);
        micSource.connect(freqAnalyser);
  
        timeData = new Float32Array(analyser.fftSize);
        freqData = new Uint8Array(freqAnalyser.frequencyBinCount);
  
        micLoop();
      } catch (e) {
        console.log('Mic error:', e);
      }
    }
  
    function stopMicMonitor() {
      if (micRaf) cancelAnimationFrame(micRaf);
      micRaf = null;
      if (micStream) {
        micStream.getTracks().forEach(t => t.stop());
        micStream = null;
      }
      if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
      }
      analyser = freqAnalyser = micSource = null;
    }
  
    function micLoop() {
      if (!analyser || !freqAnalyser) return;
  
      analyser.getFloatTimeDomainData(timeData);
      // RMS (0..~0.5)
      let sum = 0;
      for (let i = 0; i < timeData.length; i++) {
        const v = timeData[i];
        sum += v * v;
      }
      let rms = Math.sqrt(sum / timeData.length);
  
      // Update EMA baseline only when not currently blowing
      if (!isBlowDetected) {
        emaRms = (1 - EMA_ALPHA) * emaRms + EMA_ALPHA * rms;
      }
  
      // High-frequency energy ratio (to distinguish breathy noise from vowels)
      freqAnalyser.getByteFrequencyData(freqData);
      const binRes = (audioCtx ? audioCtx.sampleRate : 44100) / freqAnalyser.fftSize; // Hz per bin
      const hfStart = Math.floor(2000 / binRes); // >2kHz
      let hf = 0, total = 0;
      for (let i = 0; i < freqData.length; i++) {
        total += freqData[i];
        if (i >= hfStart) hf += freqData[i];
      }
      const hfRatio = total > 0 ? hf / total : 0;
  
      // Dynamic thresholds
      const ampTrigger = rms > Math.max(0.06, emaRms * 3.5); // louder than baseline
      const hissyEnough = hfRatio > 0.58;                    // breathy/noisy
  
      const now = performance.now();
      if (ampTrigger && hissyEnough && (now - lastBlowAt > COOLDOWN_MS)) {
        lastBlowAt = now;
        // scale intensity from how far we are above baseline
        const extra = Math.min(0.35, 2.0 * Math.max(0, rms - emaRms));
        blowIntensity = Math.min(1, blowIntensity + 0.18 + extra);
        isBlowDetected = true;
  
        // same extinguish window you had before
        clearTimeout(blowTimeout);
        blowTimeout = setTimeout(function () {
          if (flameSize <= 0.4 || blowIntensity > 0.6) {
            extinguishCandle();
            try { recognition && recognition.stop && recognition.stop(); } catch (_) {}
          }
          isBlowDetected = false;
        }, 700);
      } else if (now - lastBlowAt > 400) {
        // let the flame calm down if no recent blow
        isBlowDetected = false;
      }
  
      micRaf = requestAnimationFrame(micLoop);
    }
    // ---------- /NEW mic-level detector ----------
  
    function drawSmokes() {
      smokes.forEach(s => {
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.beginPath();
        ctx.ellipse(s.x, s.y, Math.abs(s.r), Math.abs(s.r * 1.5), 0, 0, 2 * Math.PI);
        ctx.fillStyle = "#bbb";
        ctx.fill();
        ctx.restore();
        s.y -= 0.7 + Math.random();
        s.x += Math.sin(s.y / 10) * 0.4;
        s.alpha -= 0.008 + Math.random() * 0.004;
      });
      smokes = smokes.filter(s => s.alpha > 0.05);
    }
  
    function drawCandle(flame = true, flameShake = 0, smoke = false) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
  
      // Candle body
      ctx.save();
      ctx.fillStyle = "#f8bbd0";
      ctx.fillRect(18, 38, 8, 40);
  
      // Candle top ellipse
      ctx.beginPath();
      ctx.ellipse(22, 38, 4, 2, 0, 0, 2 * Math.PI);
      ctx.fillStyle = "#e57373";
      ctx.fill();
  
      // Wick
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(22, 38);
      ctx.lineTo(22, 28);
      ctx.stroke();
      ctx.restore();
  
      // Flame
      if (flame) {
        let flick = 0;
        if (isBlowDetected) {
          flick = Math.sin(shakeFrame) * 2;
        }
  
        let flameHeight = Math.max(1, 13 * flameSize + flick);
        let flameWidth  = Math.max(0.5, 4.5 * flameSize);
  
        // Outer glow
        ctx.save();
        ctx.globalAlpha = 0.4 * flameSize;
        ctx.beginPath();
        ctx.ellipse(22, 22, flameWidth + 3, flameHeight + 3, 0, 0, 2 * Math.PI);
        ctx.fillStyle = "#fffde7";
        ctx.shadowColor = "#fffde7";
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
  
        // Yellow core
        ctx.save();
        ctx.globalAlpha = 0.8 * flameSize;
        ctx.beginPath();
        ctx.ellipse(22, 22, flameWidth, flameHeight, 0, 0, 2 * Math.PI);
        ctx.fillStyle = "#ffe082";
        ctx.shadowColor = "#ffd600";
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.restore();
  
        // Orange center
        ctx.save();
        ctx.globalAlpha = 0.6 * flameSize;
        ctx.beginPath();
        ctx.ellipse(22, 25, Math.max(0.5, flameWidth * 0.5), Math.max(0.5, flameHeight * 0.5), 0, 0, 2 * Math.PI);
        ctx.fillStyle = "#ff9800";
        ctx.shadowColor = "#ff9800";
        ctx.shadowBlur = 2;
        ctx.fill();
        ctx.restore();
      }
  
      if (smoke) {
        drawSmokes();
      }
    }
  
    function animate() {
      if (flameOn) {
        flameAngle += 0.1 + Math.random() * 0.05;
        let flameShakeVal = isBlowDetected ? Math.sin(shakeFrame) * 2 : 0;
  
        if (isBlowDetected) {
          flameSize = Math.max(0.2, flameSize - 0.03 * blowIntensity);
        }
  
        drawCandle(true, flameShakeVal, false);
        shakeFrame++;
      } else {
        if (Math.random() < 0.15) {
          smokes.push({
            x: 22 + (Math.random() - 0.5) * 3,
            y: 18 + Math.random() * 2,
            r: 4 + Math.random() * 3,
            alpha: 0.3 + Math.random() * 0.2
          });
        }
        drawCandle(false, 0, true);
      }
      requestAnimationFrame(animate);
    }
  
    const blowInstruction = document.getElementById('blow-instruction');
    const celebrateMsg = document.getElementById('celebrate-message');
    const greetingCard = document.getElementById('greeting-card');
    const resetBtn = document.getElementById('reset-btn');
    const congratsMsg = document.getElementById('congrats-message');
    const stageEl = document.querySelector('.stage');

  
    function showLottieCard() {
      const container = document.getElementById('lottie-confetti');
      container.innerHTML = '';
  
      lottie.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: 'https://lottie.host/0ea60585-2a84-47f6-931e-f52310af3cea/kz77wRyH4j.json',
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
      }).addEventListener('complete', function () {
        congratsMsg.style.display = 'block';
        resetBtn.style.display = 'inline-block';
      });
    }
  
    function extinguishCandle() {
      if (!flameOn) return;
  
      flameOn = false;
      blowing = false;
      smokes = [];
  
      const candleCanvas = document.getElementById('cake-candle-canvas');
      if (candleCanvas) {
        candleCanvas.classList.add('candle-off');
      }
  
      if (celebrateMsg) celebrateMsg.style.display = 'block';
      if (blowInstruction) blowInstruction.style.display = 'none';
      if (greetingCard) greetingCard.classList.add('show');
  
      showLottieCard();
      // Center message & hide cake via CSS
      if (stageEl) stageEl.classList.add('post-blow');

  
      const audio = document.getElementById('birthday-audio');
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio play error:', e));
      }
    }
  
    function resetAll() {
      // stop speech recognition if active
      try { recognition && recognition.abort && recognition.abort(); } catch (_) {}
      stopMicMonitor();
  
      flameOn = true;
      blowing = false;
      shakeFrame = 0;
      flameAngle = 0;
      smokes = [];
      flameSize = 1.0;
      isBlowDetected = false;
      blowIntensity = 0;
  
      const candleCanvas = document.getElementById('cake-candle-canvas');
      if (candleCanvas) {
        candleCanvas.classList.remove('candle-off');
      }
  
      if (celebrateMsg) celebrateMsg.style.display = 'none';
      if (blowInstruction) blowInstruction.style.display = 'inline-block';
      if (greetingCard) greetingCard.classList.remove('show');
      if (congratsMsg) congratsMsg.style.display = 'none';
      if (resetBtn) resetBtn.style.display = 'none';
  
      const confettiContainer = document.getElementById('lottie-confetti');
      if (confettiContainer) {
        confettiContainer.innerHTML = '';
      }
  
      const audio = document.getElementById('birthday-audio');
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
  
      drawCandle(true, 0, false);
    }
  
    // ---------- SpeechRecognition (kept) ----------
    let recognition = null; // make it accessible in reset/stop
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
  
      let recognitionActive = false;
      var blowTimeout; // shared with mic detector
  
      if (blowInstruction) {
        blowInstruction.onclick = async function () {
          if (recognitionActive) return;
  
          try {
            blowInstruction.textContent = "Listening… blow toward your mic or say 'fwoosh'";
            await startMicMonitor();
            recognition.start();
            recognitionActive = true;
            isBlowDetected = false;
            blowIntensity = 0;
          } catch (e) {
            console.log('Recognition error:', e);
            blowInstruction.textContent = "Error starting microphone. Tap to try again.";
            recognitionActive = false;
          }
        };
      }
  
      recognition.onresult = function (event) {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
  
          const transcript = result[0]?.transcript?.toLowerCase() || '';
          // keep word triggers; broaden a little
          if (transcript.includes('fwoosh') || transcript.includes('whoosh') || transcript.includes('blow')) {
            isBlowDetected = true;
            blowIntensity += 0.25;
          }
  
          if (result.isFinal || blowIntensity > 0.4) {
            isBlowDetected = true;
  
            clearTimeout(blowTimeout);
            blowTimeout = setTimeout(function () {
              if (flameSize <= 0.4 || blowIntensity > 0.6) {
                extinguishCandle();
                try { recognition.stop(); } catch (e) { console.log('Recognition stop error:', e); }
                stopMicMonitor();
              }
              isBlowDetected = false;
            }, 700);
          }
        }
      };
  
      recognition.onerror = function (event) {
        if (event.error !== 'no-speech' && blowInstruction) {
          blowInstruction.textContent = "Try again! Tap and blow into the mic.";
        }
        recognitionActive = false;
        isBlowDetected = false;
      };
  
      recognition.onend = function () {
        recognitionActive = false;
        if (flameOn && blowInstruction) {
          blowInstruction.textContent = "Tap to blow out the candle!";
        }
      };
    } else if (blowInstruction) {
      blowInstruction.textContent = "Your browser doesn't support speech! Tap and blow into the mic.";
    }
  
    if (resetBtn) {
      resetBtn.onclick = resetAll;
    }
  
    // start
    drawCandle(true, 0, false);
    animate();
  };
  