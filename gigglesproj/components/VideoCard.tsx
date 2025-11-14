import React from "react";
import { Video, ResizeMode } from "expo-av";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type VideoCardProps = {
  uri: string;
  onRef?: (v: Video | null) => void;
  shouldPlay?: boolean;
  onError?: () => void;
  style?: any;
  isActive?: boolean;
  paused?: boolean;
  onPress?: () => void;
  onPlaybackStatusUpdate?: (status: any) => void;
};

function VideoCard({
  uri,
  onRef,
  shouldPlay = false,
  onError,
  style,
  isActive = false,
  paused = false,
  onPress,
  onPlaybackStatusUpdate,
}: VideoCardProps) {
  return (
    <View style={[styles.container, style]}>
      <Video
        ref={onRef}
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay={!!shouldPlay}
        onError={onError}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />

      <Pressable onPress={onPress} style={StyleSheet.absoluteFill}>
        {isActive && paused ? (
          <View style={styles.playOverlay} pointerEvents="none">
            <Ionicons name="play" size={60} color="white" style={{ opacity: 0.3 }} />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  playOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default React.memo(VideoCard);