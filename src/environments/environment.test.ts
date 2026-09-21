import { AppEnvironment } from './environment.model';

export const environment: AppEnvironment = {
  production: false,
  name: 'test',
  appName: 'Construction Workforce Management System',
  companyName: 'BuildFlow Construction',
  firstAdminEmails: ['admin@buildflow.co.th', 'burphithak01@gmail.com', 'test@buildflow.co.th'],
  firebase: {
    apiKey: 'AIzaSyBMMAdbU42hXvJ7sYDDKDG8Xh8irPAnAcM',
    authDomain: 'buildflow-construction-test.firebaseapp.com',
    projectId: 'buildflow-construction-test',
    storageBucket: 'buildflow-construction-test.firebasestorage.app',
    messagingSenderId: '365977278015',
    appId: '1:365977278015:web:6bc16698700c24ded2ca8a',
    measurementId: 'G-7R140YQP4N',
  },
};
