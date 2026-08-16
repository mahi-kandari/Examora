import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	orderBy,
	query,
	where,
} from 'firebase/firestore';

import api from './api';
import { db } from './firebase';

export async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 15000,   // 15 seconds just for file transfer
  });

  return response.data;   // { id: "abc123" }
}

export async function confirmExam(id, editedFields) {
  const response = await api.put(
    `/confirm/${id}`,
    {
      corrected_fields: editedFields,
    }
  );
  return response.data;
}

export async function getExam(id) {
	try {
		const snapshot = await getDoc(doc(db, 'exams', id));
		if (!snapshot.exists()) {
			throw new Error('Exam not found');
		}

		return { id: snapshot.id, ...snapshot.data() };
	} catch (error) {
		throw new Error(error.message || 'Failed to fetch exam', { cause: error });
	}
}

export async function listExams(userId) {
	try {
		const examsQuery = query(
			collection(db, 'exams'),
			where('userId', '==', userId),
			orderBy('exam_date', 'asc')
		);

		const snapshot = await getDocs(examsQuery);
		return snapshot.docs.map((documentSnapshot) => ({
			id: documentSnapshot.id,
			...documentSnapshot.data(),
		}));
	} catch (error) {
		throw new Error(error.message || 'Failed to list exams', { cause: error });
	}
}

export async function deleteExam(id) {
	try {
		await deleteDoc(doc(db, 'exams', id));
	} catch (error) {
		throw new Error(error.message || 'Failed to delete exam', { cause: error });
	}
}
