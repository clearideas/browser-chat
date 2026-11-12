<script setup lang="ts">
import { useWidgetI18n } from '../i18n/runtime'
import { getIconSVG, type IconName } from '../icons'
import type { WidgetAction } from '../types'

const props = defineProps<{
  actions: WidgetAction[]
  widgetColor: string
}>()

const { t } = useWidgetI18n()

const emit = defineEmits<{
  action: [action: WidgetAction]
}>()
</script>

<template>
  <template v-for="action in props.actions" :key="action.id">
    <button
      type="button"
      class="ci-widget-action"
      :class="{ 'ci-widget-action--chat': action.type === 'chat' }"
      @click="emit('action', action)"
      :style="
        action.type === 'chat'
          ? {
              backgroundColor: props.widgetColor,
              color: 'var(--ci-widget-on-accent)',
            }
          : {}
      "
    >
      <span class="ci-widget-action__left">
        <span class="ci-widget-action__title" dir="auto">{{ action.title }}</span>
        <span class="ci-widget-action__sub" dir="auto">{{ action.description }}</span>
        <span v-if="action.type === 'link'" class="ci-sr-only">{{ t('chat.opensInNewTab') }}</span>
      </span>
      <span class="ci-widget-action__right">
        <span
          v-if="action.icon && action.type === 'chat'"
          class="ci-widget-icon"
          v-html="getIconSVG((action.icon as IconName) || 'sparkles', 18)"
        ></span>
        <span
          v-else
          class="ci-widget-icon ci-widget-icon--mirror"
          v-html="getIconSVG('chevronRight', 16)"
        ></span>
      </span>
    </button>
  </template>
</template>

<style scoped>
.ci-widget-action {
  display: flex;
  /* A button: full width (as the former block element) with padding inside that width. */
  box-sizing: border-box;
  width: calc(100% - 24px);
  border: none;
  font: inherit;
  text-align: start;
  color: inherit;
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
  color: var(--ci-widget-on-accent) !important;
}

.ci-widget-action--chat .ci-widget-action__title,
.ci-widget-action--chat .ci-widget-action__sub,
.ci-widget-action--chat .ci-widget-action__right {
  color: var(--ci-widget-on-accent) !important;
}

.ci-widget-action--chat .ci-widget-action__sub {
  opacity: 0.9;
}

.ci-widget-action--chat .ci-widget-icon {
  color: var(--ci-widget-on-accent) !important;
}

.ci-widget-action__left {
  display: block;
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.ci-widget-action__title {
  display: block;
  font-weight: 600;
  font-size: 14px;
  color: rgb(var(--ci-widget-on-surface)) !important;
}

.ci-widget-action__sub {
  display: block;
  font-size: 12px;
  color: rgba(var(--ci-widget-on-surface), var(--ci-widget-medium-emphasis-opacity));
}

.ci-widget-action__right {
  display: flex;
  align-items: center;
  color: var(--ci-widget-accent-text);
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
