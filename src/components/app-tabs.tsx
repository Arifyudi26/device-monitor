import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

const GREEN = '#34C759';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: GREEN } }}>

      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'monitoring', selected: 'monitoring' }}
          selectedColor={GREEN}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="logs">
        <NativeTabs.Trigger.Label>Logs</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'format_list_bulleted', selected: 'format_list_bulleted' }}
          selectedColor={GREEN}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          md={{ default: 'settings', selected: 'settings' }}
          selectedColor={GREEN}
        />
      </NativeTabs.Trigger>

    </NativeTabs>
  );
}
