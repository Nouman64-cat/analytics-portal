import React from "react";
import { Drawer } from "expo-router/drawer";
import { useTheme } from "../../lib/theme";
import { DrawerContent } from "../../components/DrawerContent";

export default function AppDrawerLayout() {
  const t = useTheme();
  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: "front",
        drawerStyle: { width: 280 },
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Drawer.Screen name="index" options={{ title: "Dashboard" }} />
      <Drawer.Screen name="leads" options={{ title: "Leads" }} />
      <Drawer.Screen name="stats" options={{ title: "Stats" }} />
      <Drawer.Screen name="interviews" options={{ title: "Interviews" }} />
      <Drawer.Screen name="calendar" options={{ title: "Calendar" }} />
      <Drawer.Screen name="companies" options={{ title: "Companies" }} />
      <Drawer.Screen name="candidates" options={{ title: "Candidates" }} />
      <Drawer.Screen name="performance" options={{ title: "Performance" }} />
      <Drawer.Screen name="resume-profiles" options={{ title: "Resume Profiles" }} />
      <Drawer.Screen name="business-developers" options={{ title: "Business Devs" }} />
      <Drawer.Screen name="activities" options={{ title: "Activities" }} />
      <Drawer.Screen name="departments" options={{ title: "Departments" }} />
      <Drawer.Screen name="users" options={{ title: "User Management" }} />
      <Drawer.Screen name="backup" options={{ title: "Database Backup" }} />
      <Drawer.Screen name="announcements" options={{ title: "Announcements" }} />
      <Drawer.Screen name="messages" options={{ title: "Messages" }} />
      <Drawer.Screen name="chat" options={{ title: "Chat Assistant" }} />
      <Drawer.Screen name="profile" options={{ title: "Profile" }} />
      <Drawer.Screen name="settings" options={{ title: "Settings" }} />
      <Drawer.Screen
        name="change-password"
        options={{ title: "Change Password", drawerItemStyle: { display: "none" }, swipeEnabled: false }}
      />
    </Drawer>
  );
}
