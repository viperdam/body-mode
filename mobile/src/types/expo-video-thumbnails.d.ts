// Type declaration for expo-video-thumbnails
// This provides TypeScript support for the dynamic import

declare module 'expo-video-thumbnails' {
    export interface ThumbnailOptions {
        /** The time position in milliseconds at which to get the thumbnail */
        time?: number;
        /** Quality of the thumbnail image (0.0 to 1.0) */
        quality?: number;
    }

    export interface ThumbnailResult {
        /** Local file URI of the generated thumbnail image */
        uri: string;
        /** Width of the thumbnail image in pixels */
        width: number;
        /** Height of the thumbnail image in pixels */
        height: number;
    }

    export const VideoThumbnails: {
        /**
         * Generate a thumbnail from a video file
         * @param videoUri The URI of the video file
         * @param options Options for thumbnail generation
         * @returns A promise that resolves with the thumbnail result
         */
        getThumbnailAsync(videoUri: string, options?: ThumbnailOptions): Promise<ThumbnailResult>;
    };
}
