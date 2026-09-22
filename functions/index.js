const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

exports.setUserPassword = onCall({ region: 'asia-southeast1' }, async (request) => {
  await assertAdmin(request);
  const uid = String(request.data?.uid ?? '').trim();
  const password = String(request.data?.password ?? '');
  if (!uid || password.length < 6) {
    throw new HttpsError('invalid-argument', 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
  }
  await getAuth().updateUser(uid, { password });
  return { ok: true };
});

exports.updateUserEmail = onCall({ region: 'asia-southeast1' }, async (request) => {
  await assertAdmin(request);
  const uid = String(request.data?.uid ?? '').trim();
  const email = String(request.data?.email ?? '').trim().toLowerCase();
  if (!uid || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'กรุณากรอกอีเมลให้ถูกต้อง');
  }
  try {
    await getAuth().updateUser(uid, { email });
  } catch (error) {
    const code = String(error?.code ?? '');
    if (code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'อีเมลนี้ถูกใช้แล้ว');
    }
    if (code === 'auth/invalid-email') {
      throw new HttpsError('invalid-argument', 'กรุณากรอกอีเมลให้ถูกต้อง');
    }
    throw new HttpsError('internal', 'ไม่สามารถเปลี่ยนอีเมลได้');
  }
  return { ok: true };
});

exports.lookupAuthEmail = onCall({ region: 'asia-southeast1' }, async (request) => {
  const username = String(request.data?.username ?? '')
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new HttpsError('invalid-argument', 'ชื่อผู้ใช้ไม่ถูกต้อง');
  }
  const snapshot = await getFirestore()
    .collection('users')
    .where('username', '==', username)
    .limit(1)
    .get();
  if (snapshot.empty) {
    throw new HttpsError('not-found', 'ไม่พบผู้ใช้');
  }
  const email = String(snapshot.docs[0].data()?.email ?? '');
  if (!email) {
    throw new HttpsError('not-found', 'ไม่พบผู้ใช้');
  }
  return { email };
});

async function assertAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'ต้องเข้าสู่ระบบ');
  }
  const caller = await getFirestore().doc(`users/${request.auth.uid}`).get();
  if (!caller.exists || caller.data()?.role !== 'ADMIN') {
    throw new HttpsError('permission-denied', 'เฉพาะผู้ดูแลระบบเท่านั้น');
  }
}
