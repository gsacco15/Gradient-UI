// Open to try, account to keep: the studio actions that ask a guest to join first.
import { useStore } from '../store';
import { withAccount } from './supabase';

export const saveGated = () => withAccount('Create a free account to save your skies. Everything you made so far comes with you.', () => useStore.getState().saveProject());
export const exportGated = () => withAccount('Create a free account to export: wallpapers, CSS, posters, video and more.', () => useStore.getState().set({ exportOpen: true }));
