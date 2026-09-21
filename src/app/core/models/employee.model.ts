import { Timestamp } from '@angular/fire/firestore';
import { Auditable } from './common.model';

export type EmploymentType = 'MONTHLY' | 'DAILY';
export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';
export type EmployeeNationality = 'TH' | 'KH' | 'MM' | 'OTHER';
export type EmployeeGender = 'MALE' | 'FEMALE';

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  MONTHLY: 'รายเดือน',
  DAILY: 'รายวัน',
};

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'ใช้งาน',
  INACTIVE: 'ปิดใช้งาน',
};

export const EMPLOYEE_NATIONALITIES: readonly { value: EmployeeNationality; label: string }[] = [
  { value: 'TH', label: 'ไทย' },
  { value: 'KH', label: 'กัมพูชา' },
  { value: 'MM', label: 'เมียนมา' },
  { value: 'OTHER', label: 'อื่น ๆ' },
];

export const EMPLOYEE_NATIONALITY_LABELS: Record<EmployeeNationality, string> = {
  TH: 'ไทย',
  KH: 'กัมพูชา',
  MM: 'เมียนมา',
  OTHER: 'อื่น ๆ',
};

export function nationalityLabel(value?: string): string {
  if (value === 'TH' || value === 'KH' || value === 'MM' || value === 'OTHER') {
    return EMPLOYEE_NATIONALITY_LABELS[value];
  }
  return value?.trim() ? value : '-';
}

export const EMPLOYEE_GENDERS: readonly { value: EmployeeGender; label: string }[] = [
  { value: 'MALE', label: 'ชาย' },
  { value: 'FEMALE', label: 'หญิง' },
];

export const EMPLOYEE_GENDER_LABELS: Record<EmployeeGender, string> = {
  MALE: 'ชาย',
  FEMALE: 'หญิง',
};

export function genderLabel(value?: string): string {
  if (value === 'MALE' || value === 'FEMALE') {
    return EMPLOYEE_GENDER_LABELS[value];
  }
  return value?.trim() ? value : '-';
}

export interface EmployeePositionOption {
  name: string;
  description: string;
}

export const EMPLOYEE_POSITIONS: readonly EmployeePositionOption[] = [
  { name: 'ช่างอเนกประสงค์ / สารพัดช่าง', description: 'ทำงานได้หลายประเภท' },
  { name: 'ช่างปูน', description: 'ก่อ ฉาบ เทปูน จับเซี้ยม' },
  { name: 'ช่างไม้ / ช่างแบบ', description: 'เข้าแบบ เสา คาน พื้น และงานไม้' },
  { name: 'ช่างเหล็กเสริม', description: 'ตัด ดัด ผูกเหล็ก' },
  { name: 'ช่างเชื่อม / ช่างเหล็ก', description: 'เชื่อม ประกอบโครงเหล็ก ประตู รั้ว' },
  { name: 'ช่างหลังคา', description: 'โครงหลังคา เมทัลชีท กระเบื้อง รางน้ำ' },
  { name: 'ช่างกระเบื้อง', description: 'ปูพื้น ผนัง ห้องน้ำ' },
  { name: 'ช่างฝ้า / ผนังเบา', description: 'ยิปซัม สมาร์ทบอร์ด ฝ้าทีบาร์' },
  { name: 'ช่างสี', description: 'ทาสี พ่นสี สกิมผิว' },
  { name: 'ช่างไฟฟ้า', description: 'เดินสาย ตู้ไฟ ปลั๊ก สวิตช์ โคมไฟ' },
  { name: 'ช่างประปา / สุขาภิบาล', description: 'น้ำดี น้ำทิ้ง สุขภัณฑ์' },
  { name: 'ช่างอลูมิเนียม / กระจก', description: 'ประตู หน้าต่าง กระจก' },
  { name: 'ช่างแอร์', description: 'ติดตั้งและซ่อมระบบปรับอากาศ' },
  { name: 'ช่างเฟอร์นิเจอร์ / บิวท์อิน', description: 'ตู้ เคาน์เตอร์ งานตกแต่ง' },
  { name: 'ช่างกันซึม', description: 'ดาดฟ้า ห้องน้ำ รอยต่อ และงานซ่อมรั่ว' },
  { name: 'ช่างเครื่องจักร / งานดิน', description: 'แม็คโคร รถไถ รถบด งานขุด–ถม' },
  { name: 'คนขับรถบรรทุก', description: '6 ล้อ, 10 ล้อ, รถดั๊มพ์' },
  { name: 'กรรมกร / ผู้ช่วยช่าง', description: 'ขนของ ผสมปูน และช่วยงานทั่วไป' },
  { name: 'หัวหน้าช่าง / โฟร์แมน', description: 'ควบคุมทีมและตรวจงาน' },
  { name: 'ช่างเฉพาะทางอื่น ๆ', description: 'สำหรับงานที่ไม่เข้าหมวดด้านบน' },
];

export const EMPLOYEE_POSITION_NAMES: readonly string[] = EMPLOYEE_POSITIONS.map((item) => item.name);

export const EMPLOYEE_DEPARTMENTS: readonly EmployeePositionOption[] = [
  { name: 'บริหาร / Management', description: 'เจ้าของกิจการ ผู้จัดการโครงการ' },
  { name: 'วิศวกรรม / Engineering', description: 'วิศวกร โฟร์แมน เขียนแบบ ถอด BOQ' },
  { name: 'ก่อสร้าง / Construction', description: 'ช่างปูน ช่างเหล็ก ช่างแบบ ช่างอเนกประสงค์ ฯลฯ' },
  { name: 'เครื่องจักรและขนส่ง / Equipment & Transport', description: 'แม็คโคร รถไถ รถบรรทุก และคนขับ' },
  { name: 'จัดซื้อและคลัง / Procurement & Warehouse', description: 'สั่งวัสดุ รับของ คุมสต๊อก' },
  { name: 'ความปลอดภัย / Safety', description: 'จป. และเจ้าหน้าที่ Safety โดยเฉพาะงานโรงงาน' },
  { name: 'บัญชีและการเงิน / Accounting & Finance', description: 'ค่าแรง เงินเดือน รายรับรายจ่าย ใบเสนอราคา/วางบิล' },
  { name: 'ธุรการและบุคคล / Admin & HR', description: 'พนักงาน การลงเวลา เอกสาร และสัญญาจ้าง' },
];

export interface Employee extends Partial<Auditable> {
  id: string;
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  phone?: string;
  address?: string;
  nationality?: EmployeeNationality;
  gender?: EmployeeGender;
  position: string;
  department?: string;
  startDate: Date | Timestamp | string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dailyRate?: number;
  monthlySalary?: number;
  overtimeRate?: number;
  bankName?: string;
  bankAccount?: string;
  profileImageUrl?: string;
  note?: string;
}

export interface EmployeeWriteData {
  employeeCode: string;
  firstName: string;
  lastName: string;
  nickname?: string;
  phone?: string;
  address?: string;
  nationality?: EmployeeNationality;
  gender?: EmployeeGender;
  position: string;
  department?: string;
  startDate: Date;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  dailyRate?: number;
  monthlySalary?: number;
  overtimeRate?: number;
  bankName?: string;
  bankAccount?: string;
  profileImageUrl?: string;
  note?: string;
}
