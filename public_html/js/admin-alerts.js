/**
 * 🔔 نظام التنبيهات الصوتية والاهتزاز للوحة الإدارة (Wajeez Admin Alerts)
 * 
 * - يعمل بالكامل عبر Web Audio API دون الحاجة لملفات mp3 خارجية.
 * - يدعم الاهتزاز على هواتف أندرويد عبر Capacitor Haptics و navigator.vibrate.
 * - يتيح كتم وتفعيل التنبيهات مع الحفظ في localStorage.
 */

(function () {
    'use strict';

    let audioCtx = null;
    const STORAGE_MUTE_KEY = 'wajeez_admin_sound_muted';

    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }

    // تفعيل سياق الصوت مع أول تفاعل من المستخدم لحل قيود المتصفحات
    function initUserGesture() {
        const unlock = () => {
            getAudioContext();
            document.removeEventListener('click', unlock);
            document.removeEventListener('touchstart', unlock);
        };
        document.addEventListener('click', unlock, { once: true });
        document.addEventListener('touchstart', unlock, { once: true });
    }

    const AdminAlerts = {
        isMuted: function () {
            return localStorage.getItem(STORAGE_MUTE_KEY) === 'true';
        },

        toggleMute: function () {
            const current = this.isMuted();
            const next = !current;
            localStorage.setItem(STORAGE_MUTE_KEY, next ? 'true' : 'false');
            if (window.NativeDialogs && window.NativeDialogs.toast) {
                window.NativeDialogs.toast(next ? 'تم كتم التنبيهات الصوتية 🔇' : 'تم تفعيل التنبيهات الصوتية 🔔');
            }
            return !next;
        },

        /**
         * تشغيل نغمة واهتزاز بناءً على نوع الحدث
         * @param {'order'|'success'|'warning'|'message'|'settlement'} type 
         */
        play: function (type = 'order') {
            this.vibrate(type);

            if (this.isMuted()) return;

            const ctx = getAudioContext();
            if (!ctx) return;

            try {
                const now = ctx.currentTime;

                if (type === 'order' || type === 'settlement') {
                    // نغمة ثلاثية مميزة للأحداث المالية والطلبات (A4 -> C#5 -> E5)
                    this.playTone(ctx, 440.00, now, 0.12, 'sine', 0.25);
                    this.playTone(ctx, 554.37, now + 0.10, 0.15, 'sine', 0.3);
                    this.playTone(ctx, 659.25, now + 0.22, 0.35, 'triangle', 0.35);
                } else if (type === 'message') {
                    // نغمة رسالة ثنائية ناعمة (587Hz -> 880Hz)
                    this.playTone(ctx, 587.33, now, 0.10, 'sine', 0.2);
                    this.playTone(ctx, 880.00, now + 0.08, 0.22, 'sine', 0.25);
                } else if (type === 'success') {
                    // نغمة نجاح وتأكيد صاعدة (523Hz -> 659Hz -> 783Hz)
                    this.playTone(ctx, 523.25, now, 0.10, 'triangle', 0.2);
                    this.playTone(ctx, 659.25, now + 0.09, 0.12, 'triangle', 0.25);
                    this.playTone(ctx, 783.99, now + 0.19, 0.28, 'sine', 0.3);
                } else if (type === 'warning') {
                    // نغمة تحذير هابطة (440Hz -> 349Hz)
                    this.playTone(ctx, 440.00, now, 0.14, 'sawtooth', 0.18);
                    this.playTone(ctx, 349.23, now + 0.12, 0.25, 'triangle', 0.22);
                }
            } catch (e) {
                console.warn('[AdminAlerts] Audio error:', e);
            }
        },

        playTone: function (ctx, freq, startTime, duration, waveType = 'sine', maxGain = 0.3) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = waveType;
            osc.frequency.setValueAtTime(freq, startTime);

            // Envelope: ناعم لمنع صوت النقر (Clicking sound)
            gain.gain.setValueAtTime(0.001, startTime);
            gain.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(startTime);
            osc.stop(startTime + duration);
        },

        /**
         * تشغيل الاهتزاز
         */
        vibrate: function (type) {
            try {
                if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
                    const Haptics = window.Capacitor.Plugins.Haptics;
                    if (type === 'order' || type === 'settlement') {
                        Haptics.notification({ type: 'SUCCESS' }).catch(() => {});
                    } else if (type === 'warning') {
                        Haptics.notification({ type: 'WARNING' }).catch(() => {});
                    } else {
                        Haptics.impact({ style: 'MEDIUM' }).catch(() => {});
                    }
                    return;
                }
                if (navigator.vibrate) {
                    if (type === 'order' || type === 'settlement') {
                        navigator.vibrate([100, 60, 150]);
                    } else if (type === 'warning') {
                        navigator.vibrate([200, 100, 200]);
                    } else {
                        navigator.vibrate(80);
                    }
                }
            } catch (e) {}
        }
    };

    initUserGesture();
    window.AdminAlerts = AdminAlerts;
})();
