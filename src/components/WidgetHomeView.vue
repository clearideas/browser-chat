<script setup lang="ts">
import { icons } from '../icons'
import type { WidgetAction } from '../types'

const props = defineProps<{
  actions: WidgetAction[]
  widgetColor: string
}>()

const emit = defineEmits<{
  action: [action: WidgetAction]
}>()

// Helper function to wrap icon path in SVG tag
function getIconSVG(iconName: keyof typeof icons, size: number = 16): string {
  const iconPath = icons[iconName]
  if (!iconPath) return ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="${size}" height="${size}" fill="currentColor">${iconPath}</svg>`
}
</script>

<template>
  <template v-for="action in props.actions" :key="action.id">
    <div
      class="ci-widget-action"
      :class="{ 'ci-widget-action--chat': action.type === 'chat' }"
      @click="emit('action', action)"
      :style="
        action.type === 'chat'
          ? {
              backgroundColor: props.widgetColor || '#ED613F',
              color: '#ffffff',
            }
          : {}
      "
    >
      <div class="ci-widget-action__left">
        <div class="ci-widget-action__title">{{ action.title }}</div>
        <div class="ci-widget-action__sub">{{ action.description }}</div>
      </div>
      <div class="ci-widget-action__right">
        <span
          v-if="action.icon && action.type === 'chat'"
          class="ci-widget-icon"
          v-html="getIconSVG((action.icon as keyof typeof icons) || 'sparkles', 18)"
        ></span>
        <span v-else class="ci-widget-icon" v-html="getIconSVG('chevronRight', 16)"></span>
      </div>
    </div>
  </template>
</template>

<style scoped>
.ci-widget-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 12px 8px 12px;
  padding: 12px 14px;
  border-radius: 12px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.ci-widget-action:not(.ci-widget-action--chat) {
  background-color: rgb(255, 255, 255) !important;
  background: rgb(255, 255, 255) !important;
}

.ci-widget-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.ci-widget-action--chat {
  color: #ffffff !important;
}

.ci-widget-action--chat .ci-widget-action__title,
.ci-widget-action--chat .ci-widget-action__sub,
.ci-widget-action--chat .ci-widget-action__right {
  color: #ffffff !important;
}

.ci-widget-action--chat .ci-widget-action__sub {
  opacity: 0.9;
}

.ci-widget-action--chat .ci-widget-icon {
  color: #ffffff !important;
}

.ci-widget-action__left {
  flex: 1;
}

.ci-widget-action__title {
  font-weight: 600;
  font-size: 14px;
  color: rgb(var(--ci-widget-on-surface)) !important;
}

.ci-widget-action__sub {
  font-size: 12px;
  color: rgba(var(--ci-widget-on-surface), var(--ci-widget-medium-emphasis-opacity));
}

.ci-widget-action__right {
  display: flex;
  align-items: center;
  color: rgb(var(--ci-widget-feature));
}

.ci-widget-action__right .ci-widget-icon {
  width: 18px;
  height: 18px;
}

.ci-widget-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
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

<style>
/* Dark mode overrides - need to be unscoped to work with parent */
.ci-widget.ci-widget-dark .ci-widget-action:not(.ci-widget-action--chat) {
  background-color: rgb(31, 31, 31) !important;
  background: rgb(31, 31, 31) !important;
}

.ci-widget.ci-widget-dark .ci-widget-action:not(.ci-widget-action--chat) .ci-widget-action__title {
  color: rgb(255, 255, 255) !important;
}

.ci-widget.ci-widget-dark .ci-widget-action:not(.ci-widget-action--chat) .ci-widget-action__sub {
  color: rgba(255, 255, 255, 0.7) !important;
}
</style>
