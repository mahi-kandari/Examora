/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
	auth,
	googleProvider,
	loginWithEmail,
	loginWithGoogle,
	signupWithEmail,
} from '../services/firebase';
import {
	GoogleAuthProvider,
	updateProfile,
	onAuthStateChanged,
	signOut,
} from 'firebase/auth';
import { registerPushToken, unregisterPushToken } from '../services/messaging';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
	const [user, setUser] = useState(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
			setUser(currentUser);
			setLoading(false);
			if (currentUser) {
				// Best-effort: request notification permission and persist the FCM
				// device token on users/{uid} so the backend can reach this device.
				registerPushToken(currentUser);
			}
		});

		return unsubscribe;
	}, []);

	const value = useMemo(
		() => ({
			user,
			loading,
			loginWithGoogle: async () => {
				return loginWithGoogle();
			},
			loginWithEmail,
			signupWithEmail: async (name, email, password) => {
				const credential = await signupWithEmail(email, password);
				if (credential?.user && name) {
					await updateProfile(credential.user, { displayName: name });
				}
				return credential;
			},
			logout: async () => {
				await unregisterPushToken(user);
				return signOut(auth);
			},
		}),
		[user, loading]
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error('useAuth must be used within an AuthProvider');
	}
	return context;
}
