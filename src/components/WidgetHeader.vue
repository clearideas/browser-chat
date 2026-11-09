<script setup lang="ts">
import { useWidgetI18n } from '../i18n/runtime'
import { icons } from '../icons'
import type { InitResponse } from '../types'

const props = defineProps<{
  currentView: 'home' | 'chat'
  initData: InitResponse | null
  widgetChatName: string
  widgetColorBase: string
  widgetColorLight: string
  widgetColorDark: string
  headerContrastColor: string
  displayName: string
}>()

// Destructure props for CSS v-bind usage
const { widgetColorLight, widgetColorDark, widgetColorBase } = props
const { t } = useWidgetI18n()

const emit = defineEmits<{
  'go-home': []
  close: []
  'back-btn-ref': [element: HTMLElement | null]
  'close-btn-ref': [element: HTMLElement | null]
}>()

// Helper function to wrap icon path in SVG tag
function getIconSVG(iconName: keyof typeof icons, size: number = 16): string {
  const iconPath = icons[iconName]
  if (!iconPath) return ''
  let viewBox = '0 0 640 640' // default
  if (iconName === 'ciIcon') {
    viewBox = '0 0 512 512'
  } else if (iconName === 'chevronRight' || iconName === 'chevronLeft') {
    viewBox = '0 0 640 640'
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" fill="currentColor">${iconPath}</svg>`
}
</script>

<template>
  <div
    class="ci-widget-panel__header"
    :class="{
      'ci-widget-panel__header--hero': props.currentView === 'home',
      'ci-widget-panel__header--chat': props.currentView === 'chat',
    }"
    :style="
      props.currentView === 'home'
        ? {}
        : {
            '--chat-header-bg': props.widgetColorBase,
            backgroundColor: props.widgetColorBase,
          }
    "
  >
    <div v-if="props.currentView === 'home'" class="ci-widget-hero-background">
      <div class="ci-widget-hero-background__layer ci-widget-hero-background__layer--1"></div>
      <div class="ci-widget-hero-background__layer ci-widget-hero-background__layer--2"></div>
      <div class="ci-widget-hero-background__layer ci-widget-hero-background__layer--3"></div>
    </div>
    <div v-if="props.currentView === 'home'" class="ci-widget-hero-content">
      <div class="ci-widget-hero-content__left">
        <div class="ci-widget-hero__logo-wrapper">
          <img
            v-if="props.initData?.iconUrl"
            :src="props.initData.iconUrl"
            alt=""
            width="32"
            height="32"
            class="ci-widget-hero__logo ci-widget-hero__logo-img"
          />
          <span
            v-else
            class="ci-widget-icon ci-widget-hero__logo"
            v-html="getIconSVG('ciIcon', 32)"
          ></span>
        </div>
        <div class="ci-widget-hero__text">
          <div class="ci-widget-hero__greeting">
            <span class="ci-widget-hero__greeting-text">
              {{ t('header.greeting', { name: props.displayName }) }}
            </span>
          </div>
          <div class="ci-widget-hero__headline">
            <span class="ci-widget-hero__headline-gradient">
              {{ props.initData?.heroGreeting || t('header.heroGreetingDefault') }}
            </span>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="ci-widget-title" :style="{ color: props.headerContrastColor }">
      <img
        v-if="props.initData?.iconUrl"
        :src="props.initData.iconUrl"
        alt=""
        width="24"
        height="24"
        class="ci-widget-header-icon"
      />
      <span
        v-else
        class="ci-widget-icon ci-widget-title-icon"
        :style="{ color: props.headerContrastColor }"
        v-html="getIconSVG('ciIcon', 24)"
      ></span>
      <span class="ci-widget-title-text">{{ props.widgetChatName }}</span>
    </div>
    <div class="ci-widget-header-actions">
      <button
        v-if="props.currentView === 'chat'"
        :ref="el => emit('back-btn-ref', el as HTMLElement | null)"
        class="ci-widget-btn-icon"
        :style="{ color: props.headerContrastColor }"
        @click="emit('go-home')"
        :aria-label="t('header.backToHome')"
      >
        <span
          class="ci-widget-icon"
          :style="{ color: props.headerContrastColor }"
          v-html="getIconSVG('chevronLeft', 18)"
        ></span>
      </button>
      <button
        :ref="el => emit('close-btn-ref', el as HTMLElement | null)"
        class="ci-widget-btn-icon"
        :style="{ color: props.headerContrastColor }"
        @click="emit('close')"
        :aria-label="t('header.close')"
      >
        <span
          class="ci-widget-icon"
          :style="{ color: props.headerContrastColor }"
          v-html="getIconSVG('xmark', 18)"
        ></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ci-widget-panel__header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 12px;
  min-height: 48px;
  background: rgb(255, 255, 255);
  background-color: rgb(255, 255, 255);
  color: rgb(var(--ci-widget-on-surface));
  border-bottom: 1px solid rgba(145, 145, 145, 0.24);
  opacity: 1;
  overflow: hidden;
  transition: background-color 0.2s ease;
}

.ci-widget-panel__header--hero {
  padding: 20px 16px 16px 16px;
  min-height: auto;
  color: #fff;
  background: transparent !important;
  border-bottom: none !important;
}

.ci-widget-panel__header--chat {
  padding: 4px 8px 4px 12px;
  min-height: 40px;
  background: var(--chat-header-bg) !important;
  background-color: var(--chat-header-bg) !important;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.ci-widget-hero-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: v-bind(widgetColorBase);
  opacity: 0.85;
  pointer-events: none;
  z-index: 0;
  overflow: hidden;
}

.ci-widget-hero-background__layer {
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  opacity: 0.4;
  pointer-events: none;
}

.ci-widget-hero-background__layer--1 {
  background: radial-gradient(circle at 30% 40%, v-bind(widgetColorLight) 0%, transparent 50%);
  animation: heroFlow1 12s ease-in-out infinite;
}

.ci-widget-hero-background__layer--2 {
  background: radial-gradient(circle at 70% 60%, v-bind(widgetColorDark) 0%, transparent 50%);
  animation: heroFlow2 15s ease-in-out infinite;
}

.ci-widget-hero-background__layer--3 {
  background: radial-gradient(circle at 50% 50%, v-bind(widgetColorBase) 0%, transparent 60%);
  animation: heroFlow3 18s ease-in-out infinite;
  opacity: 0.3;
}

@keyframes heroFlow1 {
  0%,
  100% {
    transform: translate(0%, 0%) scale(1);
    opacity: 0.4;
  }
  33% {
    transform: translate(10%, -15%) scale(1.1);
    opacity: 0.5;
  }
  66% {
    transform: translate(-10%, 10%) scale(0.9);
    opacity: 0.35;
  }
}

@keyframes heroFlow2 {
  0%,
  100% {
    transform: translate(0%, 0%) scale(1);
    opacity: 0.4;
  }
  33% {
    transform: translate(-15%, 10%) scale(1.2);
    opacity: 0.5;
  }
  66% {
    transform: translate(15%, -10%) scale(0.8);
    opacity: 0.35;
  }
}

@keyframes heroFlow3 {
  0%,
  100% {
    transform: translate(0%, 0%) scale(1);
    opacity: 0.3;
  }
  50% {
    transform: translate(5%, 5%) scale(1.15);
    opacity: 0.4;
  }
}

.ci-widget-hero-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.ci-widget-hero-content__left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.ci-widget-hero__logo-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
}

.ci-widget-hero__logo {
  position: relative;
  z-index: 1;
  width: 32px;
  height: 32px;
  color: white;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
}

.ci-widget-hero__logo-img {
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.3));
}

.ci-widget-hero__text {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ci-widget-hero__greeting {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.9);
}

.ci-widget-hero__greeting-text {
  letter-spacing: 0.3px;
}

.ci-widget-hero__headline {
  font-weight: 700;
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.5px;
}

.ci-widget-hero__headline-gradient {
  background: linear-gradient(
    135deg,
    #ffffff 0%,
    rgba(255, 255, 255, 0.95) 50%,
    rgba(255, 255, 255, 0.85) 100%
  );
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
  position: relative;
  display: inline-block;
}

.ci-widget-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  flex: 1;
  min-width: 0;
  color: rgb(var(--ci-widget-on-surface));
  transition: color 0.2s ease;
}

.ci-widget-title-icon {
  width: 24px;
  height: 24px;
}

.ci-widget-title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ci-widget-header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  position: relative;
  z-index: 2;
}

.ci-widget-header-icon {
  display: block;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  object-fit: contain;
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

.ci-widget-btn-icon {
  background: transparent;
  border: none;
  color: rgb(var(--ci-widget-on-surface));
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.ci-widget-btn-icon:hover {
  background: rgba(0, 0, 0, 0.1);
}

.ci-widget-btn-icon .ci-widget-icon {
  width: 18px;
  height: 18px;
}
</style>

<style>
/* Dark mode overrides - need to be unscoped to work with parent */
.ci-widget.ci-widget-dark .ci-widget-panel__header:not(.ci-widget-panel__header--chat) {
  background: rgb(31, 31, 31);
  background-color: rgb(31, 31, 31);
  opacity: 1;
  border-bottom: 1px solid rgba(234, 234, 234, 0.12);
}

.ci-widget.ci-widget-dark .ci-widget-panel__header--hero {
  background: transparent !important;
}

.ci-widget.ci-widget-dark .ci-widget-hero-background {
  opacity: 0.9;
}

.ci-widget.ci-widget-dark .ci-widget-hero-background__layer {
  opacity: 0.5;
}

.ci-widget.ci-widget-dark .ci-widget-hero-background__layer--3 {
  opacity: 0.4;
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-title {
  color: rgb(255, 255, 255);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-icon {
  color: rgb(255, 255, 255);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-btn-icon {
  color: rgb(234, 234, 234);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero):not([style*='background-color'])
  .ci-widget-btn-icon:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgb(255, 255, 255);
}

.ci-widget-panel__header:not(.ci-widget-panel__header--hero) .ci-widget-btn-icon:hover {
  background: rgba(0, 0, 0, 0.15);
}

.ci-widget.ci-widget-dark
  .ci-widget-panel__header:not(.ci-widget-panel__header--hero)
  .ci-widget-btn-icon:hover {
  background: rgba(255, 255, 255, 0.15);
}
</style>
