<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { useWidgetI18n } from '../i18n/runtime'
import { icons } from '../icons'
import { formatDuration } from '../utils/duration'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    disabled?: boolean
    loading?: boolean
    isRecording?: boolean
    recordingDuration?: number
    waveformData?: number[]
    voiceEnabled?: boolean
    supportsVoiceRecording?: boolean
    expanded?: boolean
  }>(),
  {
    modelValue: '',
    placeholder: undefined,
    disabled: false,
    loading: false,
    isRecording: false,
    recordingDuration: 0,
    waveformData: () => [],
    voiceEnabled: false,
    supportsVoiceRecording: false,
    expanded: false,
  },
)
const { t } = useWidgetI18n()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  send: []
  'start-recording': []
  'stop-recording': []
  'cancel-recording': []
  focus: []
  blur: []
  'voice-btn-ref': [element: HTMLElement | null]
  'send-btn-ref': [element: HTMLElement | null]
  'cancel-btn-ref': [element: HTMLElement | null]
  'accept-btn-ref': [element: HTMLElement | null]
}>()

// Helper function to wrap icon path in SVG tag
function getIconSVG(iconName: keyof typeof icons, size: number = 16): string {
  const iconPath = icons[iconName]
  if (!iconPath) return ''
  let viewBox = '0 0 640 640'
  if (iconName === 'ciIcon') {
    viewBox = '0 0 512 512'
  } else if (iconName === 'chevronRight' || iconName === 'chevronLeft') {
    viewBox = '0 0 640 640'
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" fill="currentColor">${iconPath}</svg>`
}

const rows = computed(() => (props.expanded ? 3 : 1))

function handleInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update:modelValue', target.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    emit('send')
  }
}

function handleFocus() {
  emit('focus')
}

function handleBlur() {
  emit('blur')
}

// Calculate number of waveform bars based on container width
const waveformContainerRef = ref<HTMLDivElement | null>(null)
const waveformBars = ref<number>(25)

const updateWaveformBars = () => {
  if (waveformContainerRef.value) {
    const containerWidth = waveformContainerRef.value.offsetWidth
    const barWidth = 4 // width of each bar
    const gap = 2 // gap between bars
    const barWithGap = barWidth + gap
    // Calculate how many bars fit, ensuring at least 10 bars
    const calculatedBars = Math.max(10, Math.floor(containerWidth / barWithGap))
    waveformBars.value = calculatedBars
  }
}

// Watch for recording state to update waveform bars when recording starts
watch(
  () => props.isRecording,
  recording => {
    if (recording) {
      // Update bars when recording starts
      nextTick(() => {
        updateWaveformBars()
      })
    }
  },
)

// Set up ResizeObserver to update bars when container size changes
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (waveformContainerRef.value) {
    updateWaveformBars()
    resizeObserver = new ResizeObserver(() => {
      if (props.isRecording) {
        updateWaveformBars()
      }
    })
    resizeObserver.observe(waveformContainerRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})

// Expose waveformBars for parent component
defineExpose({
  waveformBars,
})
</script>

<template>
  <div class="consumer-input">
    <div class="consumer-input__wrapper">
      <textarea
        v-if="!isRecording"
        :value="modelValue"
        :placeholder="
          voiceEnabled && supportsVoiceRecording
            ? t('input.placeholderVoice')
            : placeholder || t('input.placeholder')
        "
        :disabled="disabled || loading || isRecording"
        :rows="rows"
        class="consumer-input__textarea"
        :class="{
          expanded: expanded,
          'has-voice-btn': voiceEnabled && supportsVoiceRecording,
        }"
        @input="handleInput"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
      ></textarea>
      <div v-else class="consumer-input__waveform">
        <div class="waveform-container" ref="waveformContainerRef">
          <div
            v-for="(amplitude, index) in waveformData"
            :key="index"
            class="waveform-bar"
            :style="{
              height: `${Math.max(6, 6 + amplitude * 14)}px`,
              opacity: Math.max(0.4, 0.4 + amplitude * 0.6),
            }"
          ></div>
        </div>
        <div class="waveform-duration">
          {{ formatDuration(recordingDuration || 0) }}
        </div>
      </div>
      <template v-if="!isRecording">
        <button
          v-if="voiceEnabled && supportsVoiceRecording"
          :ref="el => emit('voice-btn-ref', el as HTMLElement | null)"
          class="consumer-input__voice-btn"
          :disabled="loading"
          @click="$emit('start-recording')"
          :aria-label="t('input.startVoiceRecording')"
        >
          <span class="ci-widget-icon" v-html="getIconSVG('microphone', 18)"></span>
        </button>
        <button
          :ref="el => emit('send-btn-ref', el as HTMLElement | null)"
          class="consumer-input__send"
          :disabled="loading || !modelValue.trim()"
          @click="$emit('send')"
          :aria-label="t('input.sendMessage')"
        >
          <span class="ci-widget-icon" v-html="getIconSVG('paperPlane', 18)"></span>
        </button>
      </template>
      <template v-else>
        <button
          :ref="el => emit('cancel-btn-ref', el as HTMLElement | null)"
          class="consumer-input__cancel-btn"
          @click="$emit('cancel-recording')"
          :aria-label="t('input.cancelRecording')"
        >
          <span class="ci-widget-icon" v-html="getIconSVG('xmark', 18)"></span>
        </button>
        <button
          :ref="el => emit('accept-btn-ref', el as HTMLElement | null)"
          class="consumer-input__accept-btn"
          @click="$emit('stop-recording')"
          :aria-label="t('input.sendRecording')"
        >
          <span class="ci-widget-icon" v-html="getIconSVG('check', 18)"></span>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.consumer-input {
  display: flex;
  gap: 4px;
  align-items: stretch;
}

.consumer-input__wrapper {
  display: flex;
  gap: 0;
  align-items: stretch;
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(145, 145, 145, 0.24);
  border-radius: 8px;
  background: rgb(255, 255, 255);
  overflow: hidden;
  padding: 2px 0;
}

.consumer-input__textarea {
  flex: 1;
  min-width: 0;
  padding: 4px 12px;
  border: none !important;
  border-radius: 0;
  font-size: 14px;
  font-family: inherit;
  background: transparent !important;
  background-color: transparent !important;
  color: rgb(33, 33, 33) !important;
  resize: none;
  transition: all 180ms ease;
  line-height: 1.5;
}

.consumer-input__textarea.has-voice-btn {
  padding-right: 4px;
}

.consumer-input__textarea:focus {
  outline: none;
}

.consumer-input__wrapper:focus-within {
  border-color: rgb(var(--ci-widget-feature));
}

.consumer-input__textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.consumer-input__textarea:not(.expanded) {
  padding: 10px 12px;
  line-height: 20px;
}

.consumer-input__textarea.expanded {
  min-height: 60px;
}

.consumer-input__waveform {
  flex: 1;
  min-width: 0;
  min-height: 36px;
  padding: 8px 12px;
  border: none !important;
  border-radius: 0;
  background: transparent !important;
  background-color: transparent !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.waveform-container {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  width: 100%;
}

.waveform-bar {
  width: 4px;
  min-height: 6px;
  max-height: 20px;
  background: rgb(var(--ci-widget-feature));
  border-radius: 2px;
  transition:
    height 0.1s ease-out,
    opacity 0.1s ease-out;
  align-self: center;
  flex-shrink: 0;
}

.waveform-duration {
  font-size: 12px;
  font-weight: 600;
  color: rgb(var(--ci-widget-on-surface));
  min-width: 40px;
  text-align: right;
  flex-shrink: 0;
}

/* Responsive adjustments for narrow screens */
@media (max-width: 400px) {
  .waveform-container {
    gap: 2px;
  }

  .waveform-bar {
    width: 3px;
    min-height: 4px;
    max-height: 16px;
  }

  .waveform-duration {
    min-width: 35px;
    font-size: 11px;
  }

  .consumer-input__waveform {
    gap: 8px;
    padding: 8px 8px;
  }
}

.consumer-input__voice-btn {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  padding: 0;
  align-self: center;
  margin-left: 4px;
  border: none !important;
  border-radius: 50%;
  background: transparent !important;
  background-color: transparent !important;
  color: rgb(33, 33, 33) !important;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.consumer-input__voice-btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.05);
}

.consumer-input__voice-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.consumer-input__voice-btn .ci-widget-icon {
  width: 18px;
  height: 18px;
  color: currentColor;
}

.consumer-input__cancel-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  margin-left: 4px;
  border: none !important;
  border-radius: 50%;
  background: transparent !important;
  background-color: transparent !important;
  color: rgb(229, 57, 53) !important;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  align-self: center;
}

.consumer-input__cancel-btn:hover {
  background: rgba(229, 57, 53, 0.1);
}

.consumer-input__cancel-btn .ci-widget-icon {
  width: 18px;
  height: 18px;
  color: currentColor;
}

.consumer-input__accept-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  margin-left: 4px;
  margin-right: 6px;
  border: none;
  border-radius: 50%;
  background: rgb(var(--ci-widget-feature));
  background-color: rgb(var(--ci-widget-feature));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  align-self: center;
}

.consumer-input__accept-btn:hover {
  opacity: 0.9;
  transform: scale(1.05);
}

.consumer-input__accept-btn:active {
  transform: scale(0.95);
}

.consumer-input__accept-btn .ci-widget-icon {
  width: 18px;
  height: 18px;
  color: white;
}

.consumer-input__send {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  padding: 0;
  margin-left: 4px;
  margin-right: 4px;
  border: none;
  border-radius: 50%;
  background: rgb(var(--ci-widget-feature));
  background-color: rgb(var(--ci-widget-feature));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  align-self: center;
}

.consumer-input__send:hover:not(:disabled) {
  opacity: 0.9;
  transform: scale(1.05);
}

.consumer-input__send:active:not(:disabled) {
  transform: scale(0.95);
}

.consumer-input__send:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.consumer-input__send .ci-widget-icon {
  width: 18px;
  height: 18px;
  color: rgb(255, 255, 255);
}

.consumer-input__send .ci-widget-icon svg path {
  fill: currentColor;
}
</style>

<style>
/* Dark mode overrides - need to be unscoped to work with parent */
.ci-widget.ci-widget-dark .consumer-input__wrapper {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  border: 1px solid rgba(234, 234, 234, 0.12) !important;
}

.ci-widget.ci-widget-dark .consumer-input__textarea,
.ci-widget.ci-widget-dark .consumer-input__waveform {
  background: transparent !important;
  background-color: transparent !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
}

.ci-widget.ci-widget-dark .consumer-input__textarea::placeholder {
  color: rgba(var(--ci-widget-on-surface), 0.56) !important;
}

.ci-widget.ci-widget-dark .consumer-input__voice-btn {
  color: rgb(255, 255, 255) !important;
  border: none !important;
}

.ci-widget.ci-widget-dark .consumer-input__voice-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.ci-widget.ci-widget-dark .consumer-input__accept-btn {
  background: rgb(var(--ci-widget-feature)) !important;
  background-color: rgb(var(--ci-widget-feature)) !important;
}

.ci-widget.ci-widget-dark .consumer-input__cancel-btn {
  border: 1px solid rgba(211, 47, 47, 0.3) !important;
}
</style>
