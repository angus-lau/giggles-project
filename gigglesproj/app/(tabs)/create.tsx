// app/(tabs)/create.tsx
import React, { memo, useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Image, Pressable, useWindowDimensions, FlatList } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useRouter } from 'expo-router';

const API_BASE = "http://192.168.1.91:8000";
const USER_ID = "d4705bec-b3ab-4d7c-aa28-a10470adcbd7";
type GridImage = { id: string; url: string; w?: number; h?: number; created_at?: string };

const BottomNav = memo(function BottomNav() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}>
      <View style={{ paddingBottom: insets.bottom }}>
        <BlurView
          intensity={40}
          tint="dark"
          style={{
            marginHorizontal: 12,
            marginBottom: 10,
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              height: 64,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-around",
            }}
            // @ts-ignore
            renderToHardwareTextureAndroid
            // @ts-ignore
            shouldRasterizeIOS
          >
            <Pressable
              onPress={() => router.push('/')}
              style={{ alignItems: 'center', justifyContent: 'center', shadowColor: 'white', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10 }}
            >
              <Feather name="home" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/explore')}
              style={{ alignItems: 'center', justifyContent: 'center', shadowColor: 'white', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10 }}
            >
              <Feather name="grid" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/create')}
              accessibilityRole="button"
              accessibilityLabel="Open create screen"
              accessibilityHint="Opens the Create screen"
              hitSlop={8}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "white",
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 12,
              }}
            >
              <Image
                source={require("../../assets/images/gigglesLogo.png")}
                style={{ width: 38, height: 38, resizeMode: "contain" }}
              />
            </Pressable>

            <Pressable
              onPress={() => router.push('/messages')}
              style={{ alignItems: 'center', justifyContent: 'center', shadowColor: 'white', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10 }}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={24} color="white" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/profile')}
              style={{ alignItems: 'center', justifyContent: 'center', shadowColor: 'white', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 10 }}
            >
              <Feather name="user" size={24} color="white" />
            </Pressable>
          </View>
        </BlurView>
      </View>
    </View>
  );
});

export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const GRID_GAP = 2; // gap between tiles
  const H_PADDING = 16; // matches styles.safe paddingHorizontal
  const TILE_SIZE = Math.floor((width - H_PADDING * 2 - GRID_GAP * 2) / 3);
  const [images, setImages] = useState<GridImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const handleSearch = async () => {
    const q = queryText.trim();
    if (!q) {
      // reload latest if query cleared
      setLoadingImages(true);
      try {
        const r = await fetch(`${API_BASE}/images?limit=60&user_id=${encodeURIComponent(USER_ID)}`);
        const txt = await r.text();
        let j: any = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
        const list = Array.isArray(j?.images) ? j.images : (Array.isArray(j) ? j : []);
        const rows: GridImage[] = list.map((it: any) => ({ id: it.id || it.uuid || String(it.url), url: it.url, w: it.w, h: it.h, created_at: it.created_at })).filter((it: GridImage) => !!it.url);
        setImages(rows);
      } catch (e) {
        console.warn('Failed to reload images', e);
        setImages([]);
      } finally {
        setLoadingImages(false);
      }
      return;
    }
    setLoadingImages(true);
    try {
      const r = await fetch(`${API_BASE}/images/search?user_id=${encodeURIComponent(USER_ID)}&q=${encodeURIComponent(q)}`);
      const txt = await r.text();
      if (!r.ok) {
        console.warn('search non-200', r.status, txt);
        setImages([]);
        return;
      }
      let j: any = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
      const list = Array.isArray(j?.images) ? j.images : (Array.isArray(j) ? j : []);
      const rows: GridImage[] = list.map((it: any) => ({ id: it.id || it.uuid || String(it.url), url: it.url, w: it.w, h: it.h, created_at: it.created_at })).filter((it: GridImage) => !!it.url);
      setImages(rows);
    } catch (e) {
      console.warn('search failed', e);
      setImages([]);
    } finally {
      setLoadingImages(false);
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingImages(true);
      try {
        const r = await fetch(`${API_BASE}/images?limit=60&user_id=${encodeURIComponent(USER_ID)}`);
        const txt = await r.text();
        let j: any = null;
        try { j = txt ? JSON.parse(txt) : null; } catch {}
        const rows: GridImage[] = (j?.images ?? j ?? []).map((it: any) => ({
          id: it.id || it.uuid || String(it.url),
          url: it.url,
          w: it.w,
          h: it.h,
          created_at: it.created_at,
        })).filter((it: GridImage) => !!it.url);
        if (alive) setImages(rows);
      } catch (e) {
        console.warn('Failed to load images', e);
      } finally {
        if (alive) setLoadingImages(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const uploadToServer = async (uri: string) => {
    try {
      const form = new FormData();
      form.append('file', {
        uri,
        name: `upload.jpg`,
        type: 'image/jpeg',
      } as any);
      form.append('user_id', USER_ID);
      const resp = await fetch(`${API_BASE}/images/upload`, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: form,
      });
      const txt = await resp.text();
      let j: any = null;
      try { j = txt ? JSON.parse(txt) : null; } catch {}
      if (!resp.ok) throw new Error(j ? JSON.stringify(j) : txt);
      const row: GridImage = j?.image || j;
      if (row?.url) setImages((prev) => [{ id: row.id || row.url, url: row.url, w: row.w, h: row.h, created_at: row.created_at }, ...prev]);
    } catch (e) {
      console.warn('Upload failed', e);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={()=>{}}>
          <Feather name="camera" size={22} />
        </TouchableOpacity>

        <Text style={styles.title}>Create</Text>

        <TouchableOpacity style={styles.iconBtn} onPress={() => { /* TODO: hook up */ }}>
          <Ionicons name="settings-outline" size={22} />
        </TouchableOpacity>
      </View>

      {/* Search / caption input (kept identical to original if you had it) */}
      <View style={styles.inputWrap}>
        <Ionicons name="rocket-outline" size={18} />
        <TextInput
          placeholder="Tell Giga your idea"
          placeholderTextColor="#8C8C8C"
          style={styles.input}
          returnKeyType="search"
          value={queryText}
          onChangeText={setQueryText}
          onSubmitEditing={handleSearch}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Pressable onPress={handleSearch} accessibilityLabel="Search images">
          <Ionicons name="search-outline" size={18} />
        </Pressable>
      </View>

      {/* Optional loading hint */}
      {loadingImages ? <Text style={{ color: '#999', marginTop: 8 }}>Loading images…</Text> : null}
      {/* 3-column grid like profile widths */}
      <View style={{ marginTop: 12 }}>
        <FlatList
          data={images}
          keyExtractor={(it) => it.id}
          numColumns={3}
          scrollEnabled={false}
          columnWrapperStyle={{ gap: GRID_GAP }}
          contentContainerStyle={{ gap: GRID_GAP }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setPreviewSrc(item.url)}
              style={{ width: TILE_SIZE, height: TILE_SIZE, backgroundColor: "#1c1c1e", borderRadius: 6, overflow: 'hidden' }}
            >
              <Image source={{ uri: item.url }} style={{ width: TILE_SIZE, height: TILE_SIZE, resizeMode: 'cover' }} />
            </Pressable>
          )}
        />
      </View>

      {/* Primary actions row, centered above bottom nav */}
      <View pointerEvents="box-none" style={{ flex: 1 }}>
        <View style={[styles.fabRow, { bottom: insets.bottom + 120 }]}>
          <TouchableOpacity style={[styles.pill, styles.pillPrimary]} onPress={() => { /* TODO */ }}>
            <Ionicons name="add-circle-outline" size={18} color="#000000ff" />
            <Text style={[styles.pillText, styles.pillTextPrimary]}>New Post</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.pill, styles.pillRight]} onPress={() => { /* TODO */ }}>
            <Feather name="image" size={18} />
            <Text style={styles.pillText}>Upload Image</Text>
          </TouchableOpacity>
        </View>
      </View>

      <BottomNav />
      {previewSrc ? (
        <Pressable
          onPress={() => setPreviewSrc(null)}
          accessibilityRole="button"
          accessibilityLabel="Close preview"
          style={{
            ...(StyleSheet.absoluteFillObject as any),
            backgroundColor: 'rgba(0,0,0,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
        >
          <Pressable onPress={(e) => { (e as any)?.stopPropagation?.(); }}>
            <Image
              source={{ uri: previewSrc }}
              style={{ width: Math.min(width * 0.92, 520), height: Math.min(width * 0.92, 520), resizeMode: 'contain', borderRadius: 12 }}
            />
          </Pressable>
        </Pressable>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#000000ff", // match original
    paddingHorizontal: 16,
    // paddingTop removed; handled by SafeAreaView edges
  },
  header: {
    height: 48,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f2f2f2ff",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  inputWrap: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: "#F5F5F7",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  actionsRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 999,
    backgroundColor: "#EFEFEF",
  },
  pillRight: {
    marginLeft: 40, // pushes only the right pill further right
  },
  fabRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  pillPrimary: {
    backgroundColor: "#ffffffff",
  },
  pillText: { fontSize: 14, fontWeight: "600" },
  pillTextPrimary: { color: "#000000ff" },
  secondaryRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  secondaryBtn: {
    height: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  secondaryText: { fontSize: 13, fontWeight: "500", color: "#333" },
});