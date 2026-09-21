export type AppEnvironmentName = 'development' | 'test' | 'production';

export interface AppEnvironment {
  production: boolean;
  name: AppEnvironmentName;
  appName: string;
  companyName: string;
  firstAdminEmails: string[];
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
  };
}
