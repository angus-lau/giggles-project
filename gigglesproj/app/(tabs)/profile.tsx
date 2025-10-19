import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Image, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Video, ResizeMode } from 'expo-av';
import { useRouter } from 'expo-router';

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
  const [activeTab, setActiveTab] = useState<'grid' | 'circle'>('grid');
  const [videos, setVideos] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/users/${USER_ID}/videos`);
        const j = await r.json();
        setVideos(j?.videos ?? []); // show all videos in 3-column grid
      } catch {
        setVideos([]);
      }
    })();
  }, []);

  const gridData = useMemo(() => videos, [videos]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: 'white', fontSize: 16 }}>@{USERNAME || 'user'}</Text>
        <Feather name="menu" color="white" size={22} />
      </View>

      {/* Stats */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, marginTop: 6 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: 'white', fontSize: 16, marginBottom: 6 }}>User</Text>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            {[
              { label: 'aura', value: 0 },
              { label: 'followers', value: 0 },
              { label: 'posts', value: videos.length },
            ].map((s) => (
              <View key={s.label}>
                <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>{s.value}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, textAlign: 'center' }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="user" color="white" size={30} />
        </View>
      </View>

      {/* Actions */}
      <View style={{ paddingHorizontal: 18, marginTop: 12, flexDirection: 'row', gap: 10 }}>
        <Pressable style={styles.btnDark}><Text style={styles.btnText}>Edit profile</Text></Pressable>
        <Pressable style={styles.btnDark}><Text style={styles.btnText}>Share profile</Text></Pressable>
      </View>

      {/* Tabs: ONLY grid and circle */}
      <View style={{ marginTop: 28, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 150 }}>
          <Pressable onPress={() => setActiveTab('grid')} style={{ paddingVertical: 6 }}>
            <MaterialCommunityIcons name="grid" size={38} color={activeTab === 'grid' ? 'white' : 'rgba(255,255,255,0.6)'} />
          </Pressable>
          <Pressable onPress={() => setActiveTab('circle')} style={{ paddingVertical: 6 }}>
            <Ionicons name="ellipse" size={32} color={activeTab === 'circle' ? '#f48fb1' : 'rgba(255,255,255,0.6)'} />
          </Pressable>
        </View>
        <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', width: '88%', marginTop: 20 }} />
      </View>

      {activeTab === 'grid' ? (
        <FlatList
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: insets.bottom + 100 }}
          data={gridData}
          keyExtractor={(it) => it.id}
          numColumns={GRID_COLS}
          columnWrapperStyle={{ gap: GAP, marginBottom: GAP }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/?vid=${encodeURIComponent(item.id)}`)}
              style={{ width: CELL, height: CELL, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.1)' }}
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
          ListEmptyComponent={<Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', marginTop: 28 }}>No posts yet</Text>}
        />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#f48fb1' }} />
        </View>
      )}

      {/* Share a giggle */}
{activeTab === 'grid' && gridData.length === 0 ? (
  <View style={{ paddingHorizontal: 24, marginBottom: 24 }}>
    <Text style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 10 }}>
      Share a giggle
    </Text>
    <Pressable style={styles.uploadBtn} onPress={() => {}}>
      <Text style={{ color: 'white', fontWeight: '700' }}>Upload</Text>
    </Pressable>
  </View>
) : null}
      {/* Spacer to keep content above bottom nav */}
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

// --- BottomNav (mirrors index.tsx) ---
const BottomNav = React.memo(
  function BottomNav() {
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

              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  source={require('../../assets/images/gigglesLogo.png')}
                  style={{ width: 38, height: 38, resizeMode: 'contain' }}
                />
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
  },
  () => true
);