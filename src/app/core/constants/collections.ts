export const COLLECTIONS = {
  users: 'users',
  employees: 'employees',
  jobs: 'jobs',
  jobEmployees: 'jobEmployees',
  attendances: 'attendances',
  expenses: 'expenses',
  expenseCategories: 'expenseCategories',
  payrolls: 'payrolls',
  payslips: 'payslips',
  employeeAdvances: 'employeeAdvances',
  payrollAdjustments: 'payrollAdjustments',
  settings: 'settings',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
