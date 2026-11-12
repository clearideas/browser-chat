<script setup lang="ts">
import { computed } from 'vue'

import { useWidgetI18n } from '../i18n/runtime'
import { getIconSVG } from '../icons'
import type { ChatMessage as ChatMessageType } from '../types'
import MarkdownContent from './MarkdownContent'

const props = defineProps<{
  message: ChatMessageType
  index: number
  widgetColor: string
  isPlaying: boolean
  currentTime: number
  duration: number
  progress: number
}>()
const { t } = useWidgetI18n()

// Helper to convert hex color to rgba with opacity
function hexToRgba(hex: string, opacity: number): string {
  const cleanHex = hex.replace('#', '')
  const r = parseInt(
    cleanHex.length === 3 ? cleanHex[0] + cleanHex[0] : cleanHex.substring(0, 2),
    16,
  )
  const g = parseInt(
    cleanHex.length === 3 ? cleanHex[1] + cleanHex[1] : cleanHex.substring(2, 4),
    16,
  )
  const b = parseInt(
    cleanHex.length === 3 ? cleanHex[2] + cleanHex[2] : cleanHex.substring(4, 6),
    16,
  )
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

const widgetColorOpacity50 = computed(() => {
  const color = props.widgetColor
  if (color.startsWith('rgb')) {
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0.5)`
    }
  }
  if (color.startsWith('#')) {
    return hexToRgba(color, 0.5)
  }
  return color
})

const emit = defineEmits<{
  toggle: [index: number, audio: string]
  seek: [index: number, time: number]
}>()

function handleToggle() {
  if (props.message.audio) {
    emit('toggle', props.index, props.message.audio)
  }
}

function handleSeek(event: Event) {
  const target = event.target as HTMLInputElement
  emit('seek', props.index, parseFloat(target.value))
}
</script>

<template>
  <div
    class="ci-widget-message"
    :class="{
      'ci-widget-message--user': message.role === 'user',
      'ci-widget-message--assistant': message.role === 'assistant',
    }"
  >
    <div class="ci-widget-message__content">
      <span class="ci-sr-only">
        {{ message.role === 'user' ? t('chat.youSaid') : t('chat.assistantSaid') }}
      </span>
      <!-- Assistant content is Markdown; visitor messages are shown exactly as typed. -->
      <div v-if="message.role === 'assistant'" class="ci-widget-message__text" dir="auto">
        <MarkdownContent :source="message.content" />
      </div>
      <div
        v-else
        class="ci-widget-message__text ci-widget-message__text--plain"
        dir="auto"
        v-text="message.content"
      ></div>
      <!-- Audio controls for assistant messages with audio -->
      <div
        v-if="message.role === 'assistant' && message.audio"
        class="ci-widget-message__audio-controls"
      >
        <button
          class="ci-widget-audio-btn"
          :class="{ active: isPlaying }"
          @click="handleToggle"
          :aria-label="isPlaying ? t('audio.pause') : t('audio.play')"
          :data-tooltip="isPlaying ? t('audio.pause') : t('audio.play')"
        >
          <span class="ci-widget-icon" v-html="getIconSVG(isPlaying ? 'pause' : 'play', 14)"></span>
        </button>
        <div class="ci-widget-audio-progress">
          <input
            type="range"
            :value="currentTime"
            :max="duration || 0"
            :min="0"
            step="0.1"
            class="ci-widget-audio-slider"
            :style="{
              '--progress': `${progress}%`,
            }"
            @input="handleSeek"
            :aria-label="t('audio.position')"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ci-widget-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ci-widget-message--user {
  align-items: flex-end;
}

.ci-widget-message--user .ci-widget-message__content {
  background: v-bind(widgetColor);
  color: var(--ci-widget-on-accent);
  border-radius: 12px 12px 4px 12px;
  max-width: 85%;
}

.ci-widget-message--assistant {
  align-items: flex-start;
}

.ci-widget-message--assistant .ci-widget-message__content {
  background: rgb(255, 255, 255) !important;
  background-color: rgb(255, 255, 255) !important;
  color: rgb(var(--ci-widget-on-surface));
  border-radius: 12px 12px 12px 4px;
  max-width: 85%;
  border: 1px solid rgba(145, 145, 145, 0.24) !important;
  opacity: 1 !important;
}

.ci-widget-message--error {
  align-items: flex-start;
}

.ci-widget-message--error .ci-widget-message__content {
  background: rgba(var(--ci-widget-error), 0.1);
  color: rgb(var(--ci-widget-error));
  border-radius: 8px;
  border: 1px solid rgba(var(--ci-widget-error), 0.3);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.ci-widget-message--error .ci-widget-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.ci-widget-message__content {
  padding: 8px 12px;
  word-wrap: break-word;
  line-height: 1.5;
}

.ci-widget-message__audio-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(var(--ci-widget-border-color), var(--ci-widget-border-opacity));
}

.ci-widget-audio-progress {
  flex: 1;
  display: flex;
  align-items: center;
}

.ci-widget-audio-slider {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(var(--ci-widget-on-surface), 0.1);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.ci-widget-audio-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: v-bind(widgetColor);
  cursor: pointer;
  border: 2px solid rgb(var(--ci-widget-surface));
  box-shadow: 0 0 0 1px rgba(var(--ci-widget-border-color), var(--ci-widget-border-opacity));
  transition: all 0.2s ease;
  margin-top: -4px;
}

.ci-widget-audio-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 0 2px v-bind(widgetColor);
}

.ci-widget-audio-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: v-bind(widgetColor);
  cursor: pointer;
  border: 2px solid rgb(var(--ci-widget-surface));
  box-shadow: 0 0 0 1px rgba(var(--ci-widget-border-color), var(--ci-widget-border-opacity));
  transition: all 0.2s ease;
  margin-top: -4px;
}

.ci-widget-audio-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
  box-shadow: 0 0 0 2px v-bind(widgetColor);
}

.ci-widget-audio-slider::-webkit-slider-runnable-track {
  height: 4px;
  background: rgba(var(--ci-widget-on-surface), 0.1);
  border-radius: 2px;
}

.ci-widget-audio-slider::-moz-range-track {
  height: 4px;
  background: rgba(var(--ci-widget-on-surface), 0.1);
  border-radius: 2px;
}

/* Progress fill using a linear gradient based on current value */
.ci-widget-audio-slider {
  background: linear-gradient(
    to right,
    v-bind(widgetColor) 0%,
    v-bind(widgetColor) var(--progress, 0%),
    rgba(var(--ci-widget-on-surface), 0.1) var(--progress, 0%),
    rgba(var(--ci-widget-on-surface), 0.1) 100%
  );
}

.ci-widget-audio-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid rgba(var(--ci-widget-border-color), var(--ci-widget-border-opacity));
  border-radius: 50%;
  background: rgb(var(--ci-widget-surface));
  color: rgb(var(--ci-widget-on-surface));
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.ci-widget-audio-btn:hover {
  background: rgba(var(--ci-widget-on-surface), 0.1);
  border-color: v-bind(widgetColor);
}

.ci-widget-audio-btn.active {
  background: v-bind(widgetColor);
  color: var(--ci-widget-on-accent);
  border-color: v-bind(widgetColor);
}

.ci-widget-audio-btn .ci-widget-icon {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ci-widget-message--user .ci-widget-message__audio-controls {
  border-top-color: rgba(255, 255, 255, 0.2);
}

.ci-widget-message--user .ci-widget-audio-btn {
  background: rgba(255, 255, 255, 0.2);
  color: var(--ci-widget-on-accent);
  border-color: rgba(255, 255, 255, 0.3);
  border-color: color-mix(in srgb, currentColor 30%, transparent);
}

.ci-widget-message--user .ci-widget-audio-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
}

.ci-widget-message--user .ci-widget-audio-btn.active {
  background: rgba(255, 255, 255, 0.4);
  border-color: rgba(255, 255, 255, 0.5);
}

.ci-widget-message__text {
  font-size: 14px;
  color: currentColor;
}

.ci-widget-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  transition: color 0.2s ease;
}

.ci-widget-icon svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}

.ci-widget-icon svg path {
  fill: currentColor;
}
</style>

<style scoped>
/* Visitor messages keep their line breaks. */
.ci-widget-message__text--plain {
  white-space: pre-wrap;
}

/* Markdown content rendered by MarkdownContent */
.ci-widget-message__text :deep(> *:last-child) {
  margin-bottom: 0 !important;
}

.ci-widget-message__text :deep(p) {
  margin: 0 0 0 0;
  color: currentColor;
}

.ci-widget-message__text :deep(p:last-child) {
  margin-bottom: 0;
}

.ci-widget-message__text :deep(h1),
.ci-widget-message__text :deep(h2),
.ci-widget-message__text :deep(h3),
.ci-widget-message__text :deep(h4),
.ci-widget-message__text :deep(h5),
.ci-widget-message__text :deep(h6) {
  margin: 12px 0 8px 0;
  font-weight: 600;
  color: currentColor;
}

.ci-widget-message__text :deep(h1:first-child),
.ci-widget-message__text :deep(h2:first-child),
.ci-widget-message__text :deep(h3:first-child),
.ci-widget-message__text :deep(h4:first-child),
.ci-widget-message__text :deep(h5:first-child),
.ci-widget-message__text :deep(h6:first-child) {
  margin-top: 0;
}

.ci-widget-message__text :deep(ul),
.ci-widget-message__text :deep(ol) {
  margin: 8px 0;
  padding-inline-start: 20px;
}

.ci-widget-message__text :deep(li) {
  margin: 4px 0;
  color: currentColor;
}

.ci-widget-message__text :deep(code) {
  background: rgba(var(--ci-widget-on-surface), 0.1);
  color: currentColor;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: 'Courier New', monospace;
}

.ci-widget-message__text :deep(pre) {
  background: rgba(var(--ci-widget-on-surface), 0.05);
  color: currentColor;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}

.ci-widget-message__text :deep(pre code) {
  background: transparent;
  padding: 0;
}

.ci-widget-message__text :deep(blockquote) {
  border-inline-start: 3px solid v-bind(widgetColorOpacity50);
  padding-inline-start: 12px;
  margin: 8px 0;
  color: rgba(var(--ci-widget-on-surface), var(--ci-widget-medium-emphasis-opacity));
}

.ci-widget-message__text :deep(a) {
  color: var(--ci-widget-accent-text);
  text-decoration: underline;
}

.ci-widget-message__text :deep(a:hover) {
  text-decoration: none;
}

.ci-widget-message__text :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 8px 0;
  font-size: 0.9em;
}

.ci-widget-message__text :deep(th),
.ci-widget-message__text :deep(td) {
  padding: 8px;
  border: 1px solid rgba(var(--ci-widget-border-color), var(--ci-widget-border-opacity));
}

.ci-widget-message__text :deep(th) {
  background: rgb(var(--ci-widget-surface));
  font-weight: 600;
}

.ci-widget-message__text :deep(hr) {
  border: none;
  border-top: 1px solid rgba(var(--ci-widget-border-color), var(--ci-widget-border-opacity));
  margin: 16px 0;
}

.ci-widget-message__text :deep(.chat-source) {
  font-size: 11px;
  cursor: pointer;
  color: var(--ci-widget-accent-text);
  font-weight: normal;
  text-decoration: none;
  display: inline;
  margin-inline-start: 2px;
  background-color: rgb(var(--ci-widget-background));
  padding: 0px 8px 0px 8px;
  border-radius: 8px;
  border: solid 1px rgb(var(--ci-widget-secondary));
  flex-grow: 0;
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.ci-widget-message__text :deep(.chat-source:hover) {
  opacity: 0.8;
  border-color: v-bind(widgetColor);
}

.ci-widget-message__text :deep(.web-source) {
  color: var(--ci-widget-accent-text);
  text-decoration: underline;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.ci-widget-message__text :deep(.web-source:hover) {
  text-decoration: none;
  opacity: 0.8;
}
</style>

<style>
/* Dark mode overrides - need to be unscoped to work with parent */
.ci-widget.ci-widget-dark .ci-widget-message--assistant .ci-widget-message__content {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
  border: 1px solid rgba(234, 234, 234, 0.12) !important;
}

.ci-widget.ci-widget-dark .ci-widget-audio-btn {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
  color: rgb(var(--ci-widget-on-surface)) !important;
}

.ci-widget.ci-widget-dark .ci-widget-message__text th {
  background: rgb(31, 31, 31) !important;
  background-color: rgb(31, 31, 31) !important;
}
</style>
