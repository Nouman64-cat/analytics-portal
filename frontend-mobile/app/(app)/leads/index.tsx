import React, { useCallback, useEffect, useState } from "react";
import { View, Text, FlatList, RefreshControl, Modal, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Header } from "../../../components/Header";
import { LoadingView, ErrorBanner, EmptyState, ListRow, Fab, SearchBar, Badge, Button } from "../../../components/ui";
import { SelectField, MultiSelectField } from "../../../components/FormField";
import type { SelectOption } from "../../../components/FormField";
import { useTheme } from "../../../lib/theme";
import { leadsService, profilesService, businessDevelopersService, candidatesService } from "../../../lib/api";
import type { LeadListItem, LeadListSort, ResumeProfile, BusinessDeveloper, Candidate } from "../../../lib/types";
import { leadOutcomeBadge } from "../../../lib/statusMeta";
import { useDepartmentContext } from "../../../lib/DepartmentContext";

const PAGE_SIZE = 30;

const OUTCOME_OPTIONS: SelectOption[] = [
  { label: "Active", value: "active" },
  { label: "Unresponsive", value: "unresponsive" },
  { label: "Dropped", value: "dropped" },
  { label: "Dead", value: "dead" },
  { label: "Rejected", value: "rejected" },
  { label: "Closed", value: "closed" },
];
const CONVERTED_OPTIONS: SelectOption[] = [
  { label: "Converted", value: "true" },
  { label: "Not converted", value: "false" },
];
const SORT_OPTIONS: SelectOption[] = [
  { label: "Latest activity", value: "last_activity_desc" },
  { label: "Oldest activity", value: "last_activity_asc" },
  { label: "Company A–Z", value: "company_asc" },
  { label: "Company Z–A", value: "company_desc" },
];

export default function LeadsListScreen() {
  const t = useTheme();
  const { departmentId } = useDepartmentContext();
  const [items, setItems] = useState<LeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [bds, setBds] = useState<BusinessDeveloper[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bdFilter, setBdFilter] = useState<string | null>(null);
  const [profileFilter, setProfileFilter] = useState<string | null>(null);
  const [candidateFilter, setCandidateFilter] = useState<string[]>([]);
  const [outcomeFilter, setOutcomeFilter] = useState<string | null>(null);
  const [convertedFilter, setConvertedFilter] = useState<string | null>(null);
  const [sortFilter, setSortFilter] = useState<LeadListSort>("last_activity_desc");

  const activeFilterCount =
    (bdFilter ? 1 : 0) +
    (profileFilter ? 1 : 0) +
    (candidateFilter.length > 0 ? 1 : 0) +
    (outcomeFilter ? 1 : 0) +
    (convertedFilter ? 1 : 0) +
    (sortFilter !== "last_activity_desc" ? 1 : 0);

  useEffect(() => {
    (async () => {
      try {
        const [p, b, c] = await Promise.all([
          profilesService.list({ department_id: departmentId }),
          businessDevelopersService.list(),
          candidatesService.list({ department_id: departmentId }),
        ]);
        setProfiles(p);
        setBds(b);
        setCandidates(c);
      } catch {
        // Filter option lists are non-critical — leave them empty on failure.
      }
    })();
  }, [departmentId]);

  const load = useCallback(
    async (opts?: { isRefresh?: boolean; page?: number; append?: boolean }) => {
      const targetPage = opts?.page ?? 1;
      if (opts?.append) setLoadingMore(true);
      else if (opts?.isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await leadsService.list({
          page: targetPage,
          page_size: PAGE_SIZE,
          search,
          sort: sortFilter,
          department_id: departmentId ?? undefined,
          bd_id: bdFilter ?? undefined,
          resume_profile_id: profileFilter ?? undefined,
          candidate_ids: candidateFilter.length ? candidateFilter : undefined,
          outcome: outcomeFilter ?? undefined,
          is_converted: convertedFilter === "true" ? true : convertedFilter === "false" ? false : undefined,
        });
        setItems((prev) => (opts?.append ? [...prev, ...result.items] : result.items));
        setTotal(result.total);
        setPage(targetPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load leads");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [search, sortFilter, departmentId, bdFilter, profileFilter, candidateFilter, outcomeFilter, convertedFilter],
  );

  useFocusEffect(
    useCallback(() => {
      load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  function applyFilters() {
    setFiltersOpen(false);
    load();
  }

  function resetFilters() {
    setBdFilter(null);
    setProfileFilter(null);
    setCandidateFilter([]);
    setOutcomeFilter(null);
    setConvertedFilter(null);
    setSortFilter("last_activity_desc");
  }

  function loadMore() {
    if (loadingMore || loading || items.length >= total) return;
    load({ page: page + 1, append: true });
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={`Leads (${total})`} />
      <View style={{ padding: 16, paddingBottom: 8, flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <SearchBar value={search} onChangeText={(v) => { setSearch(v); load(); }} placeholder="Search company, role, candidate…" />
        </View>
        <TouchableOpacity
          onPress={() => setFiltersOpen(true)}
          style={{
            width: 46,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: t.surfaceAlt,
            borderWidth: 1,
            borderColor: t.border,
            borderRadius: 12,
          }}
        >
          <Ionicons name="options-outline" size={19} color={t.text} />
          {activeFilterCount > 0 && (
            <View
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                minWidth: 17,
                height: 17,
                borderRadius: 9,
                paddingHorizontal: 3,
                backgroundColor: t.primary,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ color: t.primaryText, fontSize: 10, fontWeight: "800" }}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {error && (
        <View style={{ paddingHorizontal: 16 }}>
          <ErrorBanner message={error} onRetry={() => load()} />
        </View>
      )}

      {loading ? (
        <LoadingView />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.thread_id}
          contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} tintColor={t.primary} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListEmptyComponent={<EmptyState icon="locate-outline" title="No leads found" subtitle="Try different filters or add a new lead." />}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 16 }}>
                <ActivityIndicator color={t.primary} />
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const badge = leadOutcomeBadge(item.lead_outcome, item.lead_status_label);
            return (
              <ListRow
                leftDot={badge.dot}
                title={`${item.company_name ?? "Unknown company"} — ${item.primary_role ?? "Role TBD"}`}
                subtitle={`${item.candidate_name ?? "Unassigned"} • ${item.interview_count} round${item.interview_count === 1 ? "" : "s"}`}
                onPress={() => router.push(`/leads/${item.thread_id}`)}
                right={<Badge label={badge.label} bg={badge.bg} color={badge.color} />}
              />
            );
          }}
        />
      )}
      <Fab onPress={() => router.push("/leads/new")} />

      <Modal visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <Header
            title="Filter Leads"
            hideMenu
            right={
              <TouchableOpacity onPress={() => setFiltersOpen(false)}>
                <Ionicons name="close" size={24} color={t.text} />
              </TouchableOpacity>
            }
          />
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <SelectField
              label="Business Developer"
              value={bdFilter}
              onSelect={setBdFilter}
              options={bds.map((b) => ({ label: b.name, value: b.id }))}
              placeholder="All business developers"
            />
            <SelectField
              label="Resume Profile"
              value={profileFilter}
              onSelect={setProfileFilter}
              options={profiles.map((p) => ({ label: p.name, value: p.id }))}
              placeholder="All resume profiles"
            />
            <MultiSelectField
              label="Candidates"
              values={candidateFilter}
              onChange={setCandidateFilter}
              options={candidates.map((c) => ({ label: c.name, value: c.id }))}
              placeholder="All candidates"
            />
            <SelectField label="Outcome" value={outcomeFilter} onSelect={setOutcomeFilter} options={OUTCOME_OPTIONS} placeholder="Any outcome" />
            <SelectField label="Conversion" value={convertedFilter} onSelect={setConvertedFilter} options={CONVERTED_OPTIONS} placeholder="Any" />
            <SelectField
              label="Sort by"
              value={sortFilter}
              onSelect={(v) => setSortFilter(v as LeadListSort)}
              options={SORT_OPTIONS}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Button title="Reset" variant="secondary" onPress={resetFilters} style={{ flex: 1 }} />
              <Button title="Apply" onPress={applyFilters} style={{ flex: 1 }} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
