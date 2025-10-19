import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Image, Dimensions, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Asset } from 'expo-asset';
import { Video, ResizeMode } from 'expo-av';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

const USER_ID = 'd4705bec-b3ab-4d7c-aa28-a10470adcbd7';
const USERNAME = 'Angus';
const API_BASE = 'http://192.168.1.87:8000';

const GRID_COLS = 3;
const SCREEN_W = Dimensions.get('window').width;
const GAP = 4;
const CELL = Math.floor((SCREEN_W - 24 - GAP * (GRID_COLS - 1)) / GRID_COLS);

export default function Profile() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { uid, uname } = useLocalSearchParams<{ uid?: string; uname?: string }>();
  const targetUserId = uid || USER_ID; // default to me
  const isSelf = targetUserId === USER_ID;
  const displayName = uname || USERNAME;
  const [activeTab, setActiveTab] = useState<'grid' | 'circle'>('grid');
  const [videos, setVideos] = useState<any[]>([]);
  const [likedVideos, setLikedVideos] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

// ---- lightweight profile cache shared via globalThis ----
type ProfileBundle = {
  stats: { username: string; avatar_url?: string; aura: number; posts: number; followers: number; following: number } | null;
  videos: any[];
  likes: any[];
  ts: number;
};

const __pcache: Map<string, ProfileBundle> = (globalThis as any).__profileCache || new Map();
(globalThis as any).__profileCache = __pcache;

async function _fetchBundle(base: string, uid: string): Promise<ProfileBundle> {
  const [statsRes, vidsRes, likesRes] = await Promise.all([
    fetch(`${base}/users/${uid}`).then(r => r.ok ? r.json() : Promise.resolve({})).catch(() => ({})),
    fetch(`${base}/users/${uid}/videos`).then(r => r.json()).catch(() => ({ videos: [] })),
    fetch(`${base}/users/${uid}/likes`).then(r => r.json()).catch(() => ({ video_ids: [] })),
  ]);
  const stats = statsRes?.user ?? null;
  const videos = vidsRes?.videos ?? [];
  const ids: string[] = likesRes?.video_ids ?? [];
  const likes = await Promise.all(
    ids.slice(0, 12).map(async (id) => {
      try { const vr = await fetch(`${base}/videos/${id}`); const vj = await vr.json(); return vj?.video; } catch { return null; }
    })
  ).then(rows => rows.filter(Boolean) as any[]);
  return { stats, videos, likes, ts: Date.now() };
}

async function prefetchProfileGlobal(base: string, uid: string) {
  try {
    const b = await _fetchBundle(base, uid);
    __pcache.set(uid, b);
    // warm media
    const urls = [
      ...(b.videos || []).slice(0, 12).map((v: any) => v?.url).filter(Boolean),
      ...(b.likes || []).slice(0, 12).map((v: any) => v?.url).filter(Boolean),
    ];
    try { await Promise.all(urls.map((u) => Asset.fromURI(u).downloadAsync())); } catch {}
  } catch {}
}

// expose to other screens (e.g., index.tsx) without importing
;(globalThis as any).__prefetchProfile = (uid: string) => prefetchProfileGlobal(API_BASE, uid);

useEffect(() => {
  const hit = __pcache.get(targetUserId);
  if (hit) {
    setProfileStats(hit.stats ?? null);
    setVideos(hit.videos ?? []);
    setLikedVideos(hit.likes ?? []);
  }
}, [targetUserId]);
  // load whether current user is following the target user
  useEffect(() => {
    if (isSelf) { setIsFollowing(false); return; }
    (async () => {
      try {
        const r = await fetch(
          `${API_BASE}/users/${targetUserId}/is_following?follower_id=${encodeURIComponent(USER_ID)}`
        );
        const j = await r.json();
        setIsFollowing(!!j?.is_following);
      } catch {
        setIsFollowing(false);
      }
    })();
  }, [targetUserId, isSelf]);

  const prefetchAssets = useCallback(async (urls: string[]) => {
    try {
      await Promise.all(urls.filter(Boolean).map((u) => Asset.fromURI(u).downloadAsync()));
    } catch {}
  }, []);

  // Added state for user profile stats
  const [profileStats, setProfileStats] = useState<{
    username: string;
    avatar_url?: string;
    aura: number;
    posts: number;
    followers: number;
    following: number;
  } | null>(null);

  const loadMine = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/users/${targetUserId}/videos`);
      const j = await r.json();
      setVideos(j?.videos ?? []);
      const urls = (j?.videos ?? []).slice(0, 12).map((v: any) => v.url).filter(Boolean);
      prefetchAssets(urls);
      const current = __pcache.get(targetUserId) || { stats: profileStats, videos: [], likes: [], ts: 0 };
__pcache.set(targetUserId, { ...current, videos: j?.videos ?? [], ts: Date.now() });
    } catch {
      setVideos([]);
    }
  }, [targetUserId, prefetchAssets]);

  const loadLiked = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/users/${targetUserId}/likes`);
      const j = await r.json();
      
      const ids: string[] = j?.video_ids ?? [];
      if (!ids.length) {
        setLikedVideos([]);
        return;
      }
      const rows = await Promise.all(
        ids.map(async (id) => {
          try {
            const vr = await fetch(`${API_BASE}/videos/${id}`);
            const vj = await vr.json();
            const current = __pcache.get(targetUserId) || { stats: profileStats, videos: [], likes: [], ts: 0 };
__pcache.set(targetUserId, { ...current, likes: rows.filter(Boolean) as any[], ts: Date.now() });
            return vj?.video;
          } catch {
            return null;
          }
        })
      );
      setLikedVideos(rows.filter(Boolean));
      const urls = rows.filter(Boolean).slice(0, 12).map((v: any) => v.url).filter(Boolean);
      prefetchAssets(urls);
    } catch {
      setLikedVideos([]);
    }
  }, [targetUserId, prefetchAssets]);
  useEffect(() => {
    if (activeTab === 'grid') prefetchAssets(videos.slice(0, 12).map((v: any) => v.url));
    if (activeTab === 'circle') prefetchAssets(likedVideos.slice(0, 12).map((v: any) => v.url));
  }, [activeTab, videos, likedVideos, prefetchAssets]);

  // New function to load user profile stats
  const loadProfileStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/users/${targetUserId}`);
      if (!res.ok) {
        setProfileStats(null);
        return;
      }
      const data = await res.json();
      if (data?.user) {
        setProfileStats(data.user);
        const current = __pcache.get(targetUserId) || { stats: null, videos: [], likes: [], ts: 0 };
__pcache.set(targetUserId, { ...current, stats: data.user, ts: Date.now() });
if (data.user?.avatar_url) { try { await Image.prefetch(data.user.avatar_url); } catch {} }
      } else {
        setProfileStats(null);
      }
    } catch {
      setProfileStats(null);
    }
  }, [targetUserId]);

  useEffect(() => { loadMine(); }, [loadMine]);
  useEffect(() => { loadLiked(); }, [loadLiked]);
  useEffect(() => { loadProfileStats(); }, [loadProfileStats]);

  useFocusEffect(useCallback(() => { loadMine(); }, [loadMine]));
  useFocusEffect(useCallback(() => { loadLiked(); }, [loadLiked]));
  useFocusEffect(useCallback(() => { loadProfileStats(); }, [loadProfileStats]));

  useEffect(() => {
    if (activeTab === 'circle') loadLiked();
    if (activeTab === 'grid') loadMine();
  }, [activeTab, loadLiked, loadMine]);

  const gridData = useMemo(() => videos, [videos]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 12,
          paddingBottom: 8,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontSize: 16 }}>@{profileStats?.username || displayName || 'user'}</Text>
        <Feather name="menu" color="white" size={22} />
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginTop: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'white', fontSize: 16, marginBottom: 6 }}>User</Text>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            {[
              { label: 'aura', value: profileStats?.aura ?? 0 },
              { label: 'followers', value: profileStats?.followers ?? 0 },
              { label: 'posts', value: profileStats?.posts ?? videos.length },
            ].map((s) => (
              <View key={s.label}>
                <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
                  {s.value}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' }}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: 'rgba(255,255,255,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {profileStats?.avatar_url ? (
            <Image
              source={{ uri: profileStats.avatar_url }}
              style={{ width: 60, height: 60, borderRadius: 30 }}
            />
          ) : (
            <Feather name="user" color="white" size={30} />
          )}
        </View>
      </View>

      {/* Actions */}
      <View style={{ paddingHorizontal: 18, marginTop: 12, flexDirection: 'row', gap: 10 }}>
        {isSelf ? (
          <>
            <Pressable style={styles.btnDark}>
              <Text style={styles.btnText}>Edit profile</Text>
            </Pressable>
            <Pressable style={styles.btnDark}>
              <Text style={styles.btnText}>Share profile</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={[styles.btnDark, isFollowing && { backgroundColor: 'rgba(255,255,255,0.24)' }]}
              onPress={async () => {
                if (isSelf) return;
                const next = !isFollowing;
                setIsFollowing(next);
                // optimistic followers count update
                setProfileStats((prev) =>
                  prev ? { ...prev, followers: Math.max(0, (prev.followers ?? 0) + (next ? 1 : -1)) } : prev
                );
                try {
                  if (next) {
                    const r = await fetch(
                      `${API_BASE}/users/${targetUserId}/follow?follower_id=${encodeURIComponent(USER_ID)}`,
                      { method: 'POST' }
                    );
                    const j = await r.json();
                    if (!r.ok) throw new Error(JSON.stringify(j));
                    setProfileStats((prev) => prev ? { ...prev, followers: Number(j?.followers ?? prev.followers ?? 0) } : prev);
                  } else {
                    const r = await fetch(
                      `${API_BASE}/users/${targetUserId}/follow?follower_id=${encodeURIComponent(USER_ID)}`,
                      { method: 'DELETE' }
                    );
                    const j = await r.json();
                    if (!r.ok) throw new Error(JSON.stringify(j));
                    setProfileStats((prev) => prev ? { ...prev, followers: Number(j?.followers ?? prev.followers ?? 0) } : prev);
                  }
                } catch (e) {
                  // revert on failure
                  setIsFollowing(!next);
                  setProfileStats((prev) =>
                    prev ? { ...prev, followers: Math.max(0, (prev.followers ?? 0) + (next ? -1 : 1)) } : prev
                  );
                  console.warn('Follow toggle failed', e);
                }
              }}
            >
              <Text style={styles.btnText}>{isFollowing ? 'Followed' : 'Follow'}</Text>
            </Pressable>
            <Pressable
              style={styles.btnDark}
              onPress={() => router.push(`/messages?to=${encodeURIComponent(targetUserId)}`)}
            >
              <Text style={styles.btnText}>Message</Text>
            </Pressable>
          </>
        )}
      </View>

      {/* Tabs */}
      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 150,
          }}
        >
          <Pressable onPress={() => setActiveTab('grid')} style={{ paddingVertical: 6 }}>
            <MaterialCommunityIcons
              name="grid"
              size={38}
              color={activeTab === 'grid' ? 'white' : 'rgba(255,255,255,0.6)'}
            />
          </Pressable>
          <Pressable onPress={() => setActiveTab('circle')} style={{ paddingVertical: 6 }}>
            <Ionicons
              name="ellipse"
              size={32}
              color={activeTab === 'circle' ? '#f48fb1' : 'rgba(255,255,255,0.6)'}
            />
          </Pressable>
        </View>
        <View
          style={{
            height: 1,
            backgroundColor: 'rgba(255,255,255,0.15)',
            width: '88%',
            marginTop: 20,
          }}
        />
      </View>

      {/* Uploaded videos */}
      {activeTab === 'grid' ? (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: insets.bottom + 100,
          }}
          data={gridData}
          refreshControl={
            <RefreshControl
              refreshing={refreshing && activeTab === 'grid'}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await loadMine();
                } finally {
                  setRefreshing(false);
                }
              }}
              tintColor="#fff"
            />
          }
          keyExtractor={(it) => it.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/?vid=${encodeURIComponent(item.id)}`)}
              style={{
                width: CELL,
                height: CELL,
                borderRadius: 8,
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.1)',
              }}
            >
              {item?.url ? (
                <Video
                  source={{ uri: item.url }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode={ResizeMode.COVER}
                  isMuted
                  shouldPlay={false}
                  isLooping={false}
                  usePoster
                  posterSource={{ uri: item.url }}
                />
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 28 }}>
              No posts yet
            </Text>
          }
        />
      ) : (
        <FlatList
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: insets.bottom + 100,
          }}
          data={likedVideos}
          refreshControl={
            <RefreshControl
              refreshing={refreshing && activeTab === 'circle'}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await loadLiked();
                } finally {
                  setRefreshing(false);
                }
              }}
              tintColor="#fff"
            />
          }
          keyExtractor={(it) => it.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/?vid=${encodeURIComponent(item.id)}`)}
              style={{
                width: CELL,
                height: CELL,
                borderRadius: 8,
                overflow: 'hidden',
                backgroundColor: 'rgba(255,255,255,0.1)',
              }}
            >
              {item?.url ? (
                <Video
                  source={{ uri: item.url }}
                  style={{ width: '100%', height: '100%' }}
                  resizeMode={ResizeMode.COVER}
                  isMuted
                  shouldPlay={false}
                  isLooping={false}
                  usePoster
                  posterSource={{ uri: item.url }}
                />
              ) : null}
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 28 }}>
              No liked videos yet
            </Text>
          }
        />
      )}

      {/* Share a giggle */}
      {isSelf && activeTab === 'grid' && gridData.length === 0 ? (
        <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
          <Text
            style={{
              color: 'rgba(255,255,255,0.85)',
              textAlign: 'center',
              marginBottom: 10,
            }}
          >
            Share a giggle
          </Text>
          <Pressable style={styles.uploadBtn} onPress={() => router.push('/upload')}>
            <Text style={{ color: 'white', fontWeight: '700' }}>Upload</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Spacer */}
      <View style={{ height: insets.bottom + 84 }} />
      <BottomNav />
    </View>
  );
}

const styles = StyleSheet.create({
  btnDark: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  btnText: { color: 'white', fontWeight: '600', fontSize: 12 },
  uploadBtn: {
    backgroundColor: '#E4572E',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
});

const BottomNav = React.memo(function BottomNav() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <View style={{ paddingBottom: insets.bottom }}>
        <BlurView
          intensity={40}
          tint="dark"
          style={{
            marginHorizontal: 12,
            marginBottom: 10,
            borderRadius: 20,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              height: 64,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-around',
            }}
          >
            <Pressable onPress={() => router.push('/')} style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="home" size={24} color="white" />
            </Pressable>
            <Pressable onPress={() => router.push('/explore')} style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="grid" size={24} color="white" />
            </Pressable>
            <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Image source={require('../../assets/images/gigglesLogo.png')} style={{ width: 38, height: 38, resizeMode: 'contain' }} />
            </View>
            <Pressable onPress={() => router.push('/messages')} style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="white" />
            </Pressable>
            <Pressable onPress={() => router.push('/profile')} style={{ alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="user" size={24} color="white" />
            </Pressable>
          </View>
        </BlurView>
      </View>
    </View>
  );
});