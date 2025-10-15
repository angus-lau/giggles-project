import { Video, ResizeMode } from "expo-av";
import { View } from "react-native";


export function VideoCard({ uri, onRef }: { uri: string; onRef?: (v: Video | null) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Video
        ref={onRef}
        source={{ uri }}
        style={{ flex: 1 }}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay={false}
      />
    </View>
  );
}