import {
    TabList,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
    Tabs,
} from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

// Route type cast — typed routes regenerate after first `expo start`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyHref = any;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View style={styles.tabListContainer}>
          <ThemedView type="backgroundElement" style={styles.innerContainer}>
            <ThemedText type="smallBold" style={styles.brandText}>
              Device Monitor
            </ThemedText>
            <TabTrigger name="index" href={'/' as AnyHref} asChild>
              <TabButton>Dashboard</TabButton>
            </TabTrigger>
            <TabTrigger name="logs" href={'/logs' as AnyHref} asChild>
              <TabButton>Logs</TabButton>
            </TabTrigger>
            <TabTrigger name="settings" href={'/settings' as AnyHref} asChild>
              <TabButton>Settings</TabButton>
            </TabTrigger>
          </ThemedView>
        </View>
      </TabList>
    </Tabs>
  );
}

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable
      {...(props as object)}
      style={({ pressed }: { pressed: boolean }) => pressed && styles.pressed}
    >
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}
      >
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.five,
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
