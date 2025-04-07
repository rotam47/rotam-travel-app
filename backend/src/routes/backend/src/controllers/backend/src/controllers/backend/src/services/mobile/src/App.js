import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import { Provider as PaperProvider } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import './i18n';

// Auth Screens
import LoginScreen from './screens/auth/LoginScreen';
import RegisterScreen from './screens/auth/RegisterScreen';
import ForgotPasswordScreen from './screens/auth/ForgotPasswordScreen';

// Main Screens
import HomeScreen from './screens/HomeScreen';
import ExploreScreen from './screens/ExploreScreen';
import TravelPlanCreateScreen from './screens/TravelPlanCreateScreen';
import AIEnhancedTravelPlanCreateScreen from './screens/AIEnhancedTravelPlanCreateScreen';
import TravelPlanDetailScreen from './screens/TravelPlanDetailScreen';
import ProfileScreen from './screens/ProfileScreen';
import SettingsScreen from './screens/SettingsScreen';
import UndiscoveredPlacesScreen from './screens/UndiscoveredPlacesScreen';
import AddUndiscoveredPlaceScreen from './screens/AddUndiscoveredPlaceScreen';

// Auth Context
import { AuthProvider, useAuth } from './contexts/AuthContext';

// Theme
import theme from './theme';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AuthStack = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </Stack.Navigator>
  );
};

const HomeStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Rotam' }} />
      <Stack.Screen name="TravelPlanDetail" component={TravelPlanDetailScreen} options={{ title: 'Seyahat Planı' }} />
    </Stack.Navigator>
  );
};

const ExploreStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Explore" component={ExploreScreen} options={{ title: 'Keşfet' }} />
      <Stack.Screen name="UndiscoveredPlaces" component={UndiscoveredPlacesScreen} options={{ title: 'Keşfedilmemiş Yerler' }} />
      <Stack.Screen name="AddUndiscoveredPlace" component={AddUndiscoveredPlaceScreen} options={{ title: 'Yeni Keşif Ekle' }} />
    </Stack.Navigator>
  );
};

const PlanStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="TravelPlanCreate" component={TravelPlanCreateScreen} options={{ title: 'Rota Oluştur' }} />
      <Stack.Screen name="AIEnhancedTravelPlanCreate" component={AIEnhancedTravelPlanCreateScreen} options={{ title: 'AI Rota Oluştur' }} />
    </Stack.Navigator>
  );
};

const ProfileStack = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Ayarlar' }} />
    </Stack.Navigator>
  );
};

const MainTabs = () => {
  const { t } = useTranslation();
  
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'HomeTab') {
            iconName = 'home';
          } else if (route.name === 'ExploreTab') {
            iconName = 'explore';
          } else if (route.name === 'PlanTab') {
            iconName = 'add-circle';
            size = 30; // Larger icon for the center tab
          } else if (route.name === 'ProfileTab') {
            iconName = 'person';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
      })}
      tabBarOptions={{
        activeTintColor: theme.colors.primary,
        inactiveTintColor: 'gray',
        showLabel: true,
      }}
    >
      <Tab.Screen 
        name="HomeTab" 
        component={HomeStack} 
        options={{ 
          tabBarLabel: t('home')
        }} 
      />
      <Tab.Screen 
        name="ExploreTab" 
        component={ExploreStack} 
        options={{ 
          tabBarLabel: t('explore')
        }} 
      />
      <Tab.Screen 
        name="PlanTab" 
        component={PlanStack} 
        options={{ 
          tabBarLabel: t('create')
        }} 
      />
      <Tab.Screen 
        name="ProfileTab" 
        component={ProfileStack} 
        options={{ 
          tabBarLabel: t('profile')
        }} 
      />
    </Tab.Navigator>
  );
};

const Navigation = () => {
  const { authState, isLoading } = useAuth();

  if (isLoading) {
    return null; // or a loading screen
  }

  return (
    <NavigationContainer>
      {authState.authenticated ? <MainTabs /> : <AuthStack />}
    </NavigationContainer>
  );
};

const App = () => {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <PaperProvider theme={theme}>
        <AuthProvider>
          <Navigation />
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
};

export default App;
