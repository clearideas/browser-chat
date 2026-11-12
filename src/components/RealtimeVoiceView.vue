<script setup lang="ts">
import { computed, type CSSProperties, nextTick, ref, watch } from 'vue'

import type { RealtimeVoiceConnectionState } from '../composables/useRealtimeVoice'
import { useWidgetI18n } from '../i18n/runtime'
import { formatDuration } from '../utils/duration'

const props = withDefaults(
  defineProps<{
    connectionState: RealtimeVoiceConnectionState
    isResponding: boolean
    isMuted: boolean
    duration: number
    waveformData: number[]
    widgetColor: string
    caption?: string
    hasUserSpoken?: boolean
    /** Why the call failed or stopped, shown (and announced) in the view. */
    error?: string | null
    /** Offer recorded voice after a failure (not when the microphone itself is the problem). */
    canUseRecorded?: boolean
  }>(),
  // An absent boolean prop would otherwise be false.
  { canUseRecorded: true, caption: undefined, hasUserSpoken: false, error: null },
)

const emit = defineEmits<{ toggleMute: []; end: []; useRecorded: [] }>()
const { t } = useWidgetI18n()
const captionElement = ref<HTMLElement | null>(null)

watch(
  () => props.caption,
  async () => {
    await nextTick()
    if (captionElement.value) captionElement.value.scrollTop = captionElement.value.scrollHeight
  },
)

const status = computed(() => {
  if (props.connectionState === 'connecting' || props.connectionState === 'reconnecting') {
    return t('voice.connecting')
  }
  if (props.connectionState === 'failed') return t('voice.failed')
  if (props.isMuted) return t('voice.muted')
  if (props.isResponding) return t('voice.speaking')
  return t('voice.listening')
})

const hint = computed(() => {
  if (props.connectionState === 'connecting' || props.connectionState === 'reconnecting') {
    return t('voice.connectingHint')
  }
  if (props.isResponding) return t('voice.interruptHint')
  if (props.hasUserSpoken) return ''
  return t('voice.listeningHint')
})

const energy = computed(() => {
  if (!props.waveformData.length) return 0
  return props.waveformData.reduce((total, sample) => total + sample, 0) / props.waveformData.length
})

const orbStyle = computed(
  () =>
    ({
      '--voice-color': props.widgetColor,
      '--voice-energy': String(1 + Math.min(energy.value, 1) * 0.12),
    }) as CSSProperties,
)

const bars = computed(() => {
  if (!props.waveformData.length) return Array(7).fill(0.18)
  return Array.from({ length: 7 }, (_, index) => {
    const sourceIndex = Math.floor((index / 6) * Math.max(0, props.waveformData.length - 1))
    return Math.max(0.18, props.waveformData[sourceIndex] || 0)
  })
})
</script>

<template>
  <section class="realtime-voice" :aria-label="t('voice.conversation')">
    <div class="realtime-voice__topline">
      <span class="realtime-voice__live">
        <i></i>
        {{ t('voice.live') }}
      </span>
      <time>{{ formatDuration(duration) }}</time>
    </div>

    <div class="realtime-voice__stage">
      <div
        class="voice-orb-shell"
        :class="{
          'voice-orb-shell--speaking': isResponding,
          'voice-orb-shell--muted': isMuted,
          'voice-orb-shell--connecting': connectionState === 'connecting',
        }"
        :style="orbStyle"
        aria-hidden="true"
      >
        <span class="voice-orb-ring voice-orb-ring--outer"></span>
        <span class="voice-orb-ring voice-orb-ring--inner"></span>
        <div class="voice-orb">
          <div class="voice-orb__bars">
            <i
              v-for="(amplitude, index) in bars"
              :key="index"
              :style="{ height: `${16 + amplitude * 36}px`, animationDelay: `${index * -90}ms` }"
            ></i>
          </div>
        </div>
      </div>

      <div class="realtime-voice__state" role="status" aria-live="polite">
        <strong>{{ status }}</strong>
        <span v-if="hint">{{ hint }}</span>
      </div>

      <div
        v-if="caption"
        ref="captionElement"
        class="realtime-voice__caption"
        role="log"
        :aria-label="t('voice.transcript')"
        aria-live="polite"
        tabindex="0"
      >
        {{ caption }}
      </div>
      <!-- The chat view (where errors usually appear) is hidden during a call. -->
      <p v-if="error" class="realtime-voice__error" role="alert" dir="auto">{{ error }}</p>
      <button
        v-if="connectionState === 'failed' && canUseRecorded"
        type="button"
        class="realtime-voice__fallback"
        @click="emit('useRecorded')"
      >
        {{ t('voice.useRecorded') }}
      </button>
    </div>

    <div class="realtime-voice__controls">
      <div class="realtime-voice__control-group">
        <button
          type="button"
          class="voice-control"
          :class="{ 'voice-control--active': isMuted }"
          :aria-label="isMuted ? t('voice.unmute') : t('voice.mute')"
          :aria-pressed="isMuted"
          @click="emit('toggleMute')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M18 11v1a6 6 0 0 1-12 0v-1M12 18v3M9 21h6" />
            <path v-if="isMuted" d="m4 4 16 16" />
          </svg>
        </button>
        <span>{{ isMuted ? t('voice.unmute') : t('voice.mute') }}</span>
      </div>

      <div class="realtime-voice__control-group">
        <button
          type="button"
          class="voice-control voice-control--end"
          :aria-label="t('voice.end')"
          @click="emit('end')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92Z"
            />
            <path d="m23 1-22 22" />
          </svg>
        </button>
        <span>{{ t('voice.end') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.realtime-voice {
  box-sizing: border-box;
  min-height: 100%;
  height: 100%;
  padding: 18px 22px 22px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: rgb(var(--ci-widget-on-surface));
  background: rgb(var(--ci-widget-background));
}

.realtime-voice__topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: rgba(var(--ci-widget-on-surface), 0.7);
}

.realtime-voice__live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.realtime-voice__live i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #22a06b;
  box-shadow: 0 0 0 4px rgba(34, 160, 107, 0.13);
}

.realtime-voice__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  text-align: center;
  padding: 10px 0 14px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.voice-orb-shell {
  --voice-energy: 1;
  position: relative;
  width: 164px;
  height: 164px;
  display: grid;
  place-items: center;
  margin: 0 0 16px;
  transform: scale(var(--voice-energy));
  transition:
    transform 100ms linear,
    filter 220ms ease;
}

.voice-orb-ring {
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  border: 1.5px solid color-mix(in srgb, var(--voice-color) 48%, transparent);
  animation: voice-ring 2.8s ease-out infinite;
}

.voice-orb-ring--inner {
  inset: 22px;
  animation-delay: -1.4s;
}

.voice-orb {
  position: relative;
  width: 126px;
  height: 126px;
  overflow: hidden;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background:
    radial-gradient(circle at 31% 24%, rgba(255, 255, 255, 0.24), transparent 24%),
    linear-gradient(
      145deg,
      color-mix(in srgb, var(--voice-color) 88%, #ffffff),
      color-mix(in srgb, var(--voice-color) 76%, #111827)
    );
  box-shadow:
    0 18px 36px color-mix(in srgb, var(--voice-color) 32%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.26),
    inset 0 -18px 30px rgba(15, 23, 42, 0.12);
  animation: voice-float 4.2s ease-in-out infinite;
}

.voice-orb__bars {
  position: relative;
  z-index: 2;
  height: 58px;
  display: flex;
  align-items: center;
  gap: 5px;
}

.voice-orb__bars i {
  display: block;
  width: 4px;
  max-height: 52px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  background: color-mix(in srgb, var(--ci-widget-on-accent, #fff) 90%, transparent);
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.42);
  transition: height 90ms linear;
  animation: voice-bar 1.2s ease-in-out infinite alternate;
}

.voice-orb-shell--speaking .voice-orb {
  animation-duration: 2.4s;
}
.voice-orb-shell--speaking .voice-orb-ring {
  animation-duration: 1.8s;
}
.voice-orb-shell--muted {
  filter: grayscale(0.75);
  opacity: 0.72;
}
.voice-orb-shell--connecting .voice-orb {
  animation: voice-connect 1.4s ease-in-out infinite;
}

.realtime-voice__state strong {
  display: block;
  font-size: 21px;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.realtime-voice__state span {
  display: block;
  margin-top: 6px;
  font-size: 13px;
  /* At least 4.5:1 on the panel background (WCAG AA for small text). */
  color: rgba(var(--ci-widget-on-surface), 0.7);
}

.realtime-voice__caption {
  box-sizing: border-box;
  width: 100%;
  max-width: 326px;
  min-height: 64px;
  max-height: 118px;
  margin: 16px 0 0;
  padding: 12px 14px;
  border: 1px solid rgba(var(--ci-widget-border-color), 0.22);
  border-radius: 14px;
  background: rgb(var(--ci-widget-surface));
  box-shadow: 0 5px 18px rgba(15, 23, 42, 0.05);
  color: rgba(var(--ci-widget-on-surface), 0.84);
  font-size: 12.5px;
  line-height: 1.5;
  text-align: start;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--ci-widget-on-surface), 0.25) transparent;
}

.realtime-voice__caption:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--voice-color) 45%, transparent);
  outline-offset: 2px;
}

.realtime-voice__caption::-webkit-scrollbar {
  width: 6px;
}

.realtime-voice__caption::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(var(--ci-widget-on-surface), 0.22);
}

.realtime-voice__error {
  max-width: 280px;
  margin: 12px auto 0;
  color: rgb(var(--ci-widget-error-text, 185, 28, 28));
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
}

.realtime-voice__fallback {
  margin-top: 14px;
  padding: 7px 11px;
  border: 0;
  border-radius: 8px;
  color: var(--ci-widget-accent-text, var(--voice-color, #375dfb));
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.realtime-voice__fallback:hover {
  background: color-mix(in srgb, var(--voice-color, #375dfb) 9%, transparent);
}

.realtime-voice__controls {
  flex: 0 0 auto;
  display: flex;
  justify-content: center;
  gap: 46px;
  padding-top: 6px;
}

.realtime-voice__control-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  min-width: 62px;
  font-size: 11px;
  color: rgba(var(--ci-widget-on-surface), 0.66);
}

.voice-control {
  width: 54px;
  height: 54px;
  border: 1px solid rgba(var(--ci-widget-border-color), 0.18);
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: rgb(var(--ci-widget-on-surface));
  background: rgba(var(--ci-widget-surface), 0.92);
  cursor: pointer;
  transition:
    transform 160ms ease,
    background 160ms ease;
}

.voice-control:hover {
  transform: translateY(-2px);
}
.voice-control:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--voice-color) 35%, transparent);
  outline-offset: 3px;
}
.voice-control svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.voice-control--active {
  background: rgba(var(--ci-widget-on-surface), 0.1);
}
.voice-control--end {
  color: #fff;
  background: #d73a49;
  border-color: transparent;
}
.voice-control--end svg {
  width: 23px;
  height: 23px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
}

@keyframes voice-ring {
  0% {
    transform: scale(0.82);
    opacity: 0;
  }
  28% {
    opacity: 0.52;
  }
  100% {
    transform: scale(1.08);
    opacity: 0;
  }
}

@keyframes voice-float {
  0%,
  100% {
    transform: translateY(0) rotate(-1deg);
  }
  50% {
    transform: translateY(-6px) rotate(2deg);
  }
}

@keyframes voice-bar {
  from {
    transform: scaleY(0.78);
    opacity: 0.72;
  }
  to {
    transform: scaleY(1.08);
    opacity: 1;
  }
}

@keyframes voice-connect {
  0%,
  100% {
    transform: scale(0.94);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.03);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .voice-orb,
  .voice-orb-ring,
  .voice-orb__bars i {
    animation: none;
  }
}
</style>
