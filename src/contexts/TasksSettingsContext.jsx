import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';

import { useAuth } from '../components/auth/context/AuthContext';
import { IS_PLATFORM } from '../constants/config';
import { api } from '../utils/api';

const TasksSettingsContext = createContext({
  tasksEnabled: true,
  setTasksEnabled: () => {},
  toggleTasksEnabled: () => {},
  isTaskMasterInstalled: null,
  isTaskMasterReady: null,
  installationStatus: null,
  isCheckingInstallation: true,
  refreshTaskMasterInstallation: async () => {}
});

export const useTasksSettings = () => {
  const context = useContext(TasksSettingsContext);
  if (!context) {
    throw new Error('useTasksSettings must be used within a TasksSettingsProvider');
  }
  return context;
};

export const TasksSettingsProvider = ({ children }) => {
  const { user, token, isLoading: isAuthLoading } = useAuth();
  const [tasksEnabled, setTasksEnabled] = useState(() => {
    // Load from localStorage on initialization
    const saved = localStorage.getItem('tasks-enabled');
    return saved !== null ? JSON.parse(saved) : true; // Default to true
  });
  
  const [isTaskMasterInstalled, setIsTaskMasterInstalled] = useState(null);
  const [isTaskMasterReady, setIsTaskMasterReady] = useState(null);
  const [installationStatus, setInstallationStatus] = useState(null);
  const [isCheckingInstallation, setIsCheckingInstallation] = useState(true);
  const canCheckInstallation = IS_PLATFORM || Boolean(user && token);

  // Save to localStorage whenever tasksEnabled changes
  useEffect(() => {
    localStorage.setItem('tasks-enabled', JSON.stringify(tasksEnabled));
  }, [tasksEnabled]);

  const refreshTaskMasterInstallation = useCallback(async ({ signal } = {}) => {
    if (isAuthLoading) {
      return;
    }

    if (!canCheckInstallation) {
      setInstallationStatus(null);
      setIsTaskMasterInstalled(null);
      setIsTaskMasterReady(null);
      setIsCheckingInstallation(false);
      return;
    }

    setIsCheckingInstallation(true);

    try {
      const response = await api.get('/taskmaster/installation-status');
      if (signal?.aborted) return;
      if (response.ok) {
        const data = await response.json();
        if (signal?.aborted) return;
        setInstallationStatus(data);
        setIsTaskMasterInstalled(data.installation?.isInstalled || false);
        setIsTaskMasterReady(data.isReady || false);

        // If TaskMaster is not installed and user hasn't explicitly enabled tasks,
        // disable tasks automatically
        const userEnabledTasks = localStorage.getItem('tasks-enabled');
        if (!data.installation?.isInstalled && !userEnabledTasks) {
          setTasksEnabled(false);
        }
      } else {
        console.error('Failed to check TaskMaster installation status');
        setIsTaskMasterInstalled(false);
        setIsTaskMasterReady(false);
      }
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Error checking TaskMaster installation:', error);
      setIsTaskMasterInstalled(false);
      setIsTaskMasterReady(false);
    } finally {
      if (!signal?.aborted) {
        setIsCheckingInstallation(false);
      }
    }
  }, [canCheckInstallation, isAuthLoading]);

  // Check TaskMaster installation status asynchronously on component mount.
  useEffect(() => {
    const controller = new AbortController();

    // Run check asynchronously without blocking initial render
    const timer = setTimeout(() => {
      void refreshTaskMasterInstallation({ signal: controller.signal });
    }, 0);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [refreshTaskMasterInstallation]);

  const toggleTasksEnabled = () => {
    setTasksEnabled(prev => !prev);
  };

  const contextValue = {
    tasksEnabled,
    setTasksEnabled,
    toggleTasksEnabled,
    isTaskMasterInstalled,
    isTaskMasterReady,
    installationStatus,
    isCheckingInstallation,
    refreshTaskMasterInstallation
  };

  return (
    <TasksSettingsContext.Provider value={contextValue}>
      {children}
    </TasksSettingsContext.Provider>
  );
};

export default TasksSettingsContext;
