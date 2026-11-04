// Keyframes for the pet, its room and the little reactions (+5, hearts).
// Rendered next to each pet view; duplicates are harmless. Everything stops
// for people who ask the system for less motion.
const CSS = `
.pet-anim .pa-breathe { animation: pa-breathe 3.4s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.pet-anim .pa-breathe-slow { animation: pa-breathe 5s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
.pet-anim .pa-blink { animation: pa-blink 5s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
.pet-anim .pa-tail { animation: pa-tail 2.6s ease-in-out infinite alternate; transform-box: view-box; }
.pet-anim .pa-wag { animation: pa-tail 0.5s ease-in-out infinite alternate; transform-box: view-box; }
.pet-anim .pa-zzz { animation: pa-zzz 3.6s ease-in-out infinite; opacity: 0; }
.pet-anim .pa-twinkle { animation: pa-twinkle 2.2s ease-in-out infinite; transform-box: fill-box; transform-origin: 50% 50%; }
.pet-anim .pa-bob { animation: pa-bob 2.8s ease-in-out infinite; }
.pet-anim .pa-peek { animation: pa-peek 3.2s ease-in-out infinite; }
.pet-anim .pa-g-pat { animation: pa-pat 0.7s ease-out; transform-box: fill-box; transform-origin: 50% 100%; }
.pet-anim .pa-g-snack { animation: pa-snack 0.9s ease-in-out; transform-box: fill-box; transform-origin: 50% 100%; }
.pet-anim .pa-g-play { animation: pa-play 0.9s cubic-bezier(.3,.7,.4,1); transform-box: fill-box; transform-origin: 50% 100%; }
.pet-anim .pa-g-cheer { animation: pa-play 1.1s cubic-bezier(.3,.7,.4,1) 2; transform-box: fill-box; transform-origin: 50% 100%; }
.pet-anim .pa-prop { animation: pa-prop 1.1s ease-out both; }
.pet-anim .pa-ball { animation: pa-ball 0.9s ease-out both; }
.pet-anim .pa-lights { animation: pa-lights 2.4s ease-in-out infinite; }
.pa-float-up { animation: pa-float-up 1.6s ease-out both; }
.pa-heart { animation: pa-heart 1.4s ease-out both; }
.pa-pop-in { animation: pa-pop-in 0.45s ease-out; }
.pa-confetti { animation: pa-confetti 2.4s ease-in infinite; }
@keyframes pa-breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.015, 1.03); } }
@keyframes pa-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
@keyframes pa-tail { from { transform: rotate(-6deg); } to { transform: rotate(8deg); } }
@keyframes pa-zzz { 0% { opacity: 0; transform: translate(0, 6px) scale(0.7); } 30% { opacity: 0.9; } 100% { opacity: 0; transform: translate(10px, -18px) scale(1.1); } }
@keyframes pa-twinkle { 0%, 100% { opacity: 0.25; transform: scale(0.7); } 50% { opacity: 1; transform: scale(1.1); } }
@keyframes pa-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
@keyframes pa-peek { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-4px); } }
@keyframes pa-pat { 0% { transform: scale(1, 1); } 30% { transform: scale(1.06, 0.9); } 60% { transform: scale(0.97, 1.04); } 100% { transform: scale(1, 1); } }
@keyframes pa-snack { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-3deg); } 50% { transform: rotate(3deg) translateY(-2px); } 75% { transform: rotate(-2deg); } }
@keyframes pa-play { 0% { transform: translateY(0) scale(1, 1); } 15% { transform: translateY(0) scale(1.05, 0.92); } 45% { transform: translateY(-16px) scale(0.97, 1.04); } 75% { transform: translateY(0) scale(1.04, 0.95); } 100% { transform: translateY(0) scale(1, 1); } }
@keyframes pa-prop { 0% { opacity: 0; transform: translateY(6px) scale(0.6); } 20% { opacity: 1; transform: translateY(0) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
@keyframes pa-ball { 0% { opacity: 0; transform: translate(-30px, -30px); } 15% { opacity: 1; } 45% { transform: translate(0, 0); } 70% { transform: translate(14px, -16px); } 100% { opacity: 0; transform: translate(26px, 0); } }
@keyframes pa-lights { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
@keyframes pa-float-up { 0% { opacity: 0; transform: translate(-50%, 8px) scale(0.8); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -34px); } }
@keyframes pa-heart { 0% { opacity: 0; transform: translate(0, 0) scale(0.3); } 25% { opacity: 1; } 100% { opacity: 0; transform: translate(var(--dx, 0px), var(--dy, -60px)) scale(1.2); } }
@keyframes pa-pop-in { 0% { opacity: 0; transform: translateY(-6px) scale(0.98); } 100% { opacity: 1; transform: none; } }
@keyframes pa-confetti { 0% { opacity: 0; transform: translateY(-20px) rotate(0); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(120px) rotate(200deg); } }
@media (prefers-reduced-motion: reduce) {
  .pet-anim *, .pa-float-up, .pa-heart, .pa-pop-in, .pa-confetti { animation: none !important; }
  .pa-zzz { opacity: 0.8 !important; }
}
`

export default function PetStyles() {
  return <style>{CSS}</style>
}
