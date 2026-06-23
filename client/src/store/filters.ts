import { create } from 'zustand';
import { subDays, format } from 'date-fns';
import type { GlobalFilters } from '../types';

interface FilterStore {
  filters: GlobalFilters;
  setFilter: <K extends keyof GlobalFilters>(key: K, value: GlobalFilters[K]) => void;
  resetFilters: () => void;
}

const defaultFilters: GlobalFilters = {
  project: 'Patient Engagment Platform',
  fromDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
  toDate: format(new Date(), 'yyyy-MM-dd'),
  assignedTo: '',
  workItemType: '',
  areaPath: '',
  iterationPath: '',
  team: '',
  selectedTeams: [],
  selectedSprints: [],
};

export const useFilterStore = create<FilterStore>((set) => ({
  filters: defaultFilters,
  setFilter: (key, value) =>
    set((state) => ({ filters: { ...state.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters }),
}));
