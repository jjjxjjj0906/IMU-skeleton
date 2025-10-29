# Mac Compatibility Guide

This document provides information about Mac-specific optimizations and troubleshooting for the 3D Skeleton Viewer.

## Mac-Specific Features

### Optimizations for Mac Safari
- **WebGL Context Loss Handling**: Automatic recovery from WebGL context loss
- **Performance Monitoring**: Real-time performance tracking with warnings
- **Trackpad Support**: Optimized controls for Mac trackpad gestures
- **High DPI Support**: Proper handling of Retina displays

### Browser Recommendations
1. **Chrome** (Recommended) - Best performance and compatibility
2. **Firefox** - Good performance, full feature support
3. **Safari** - Supported but may have performance issues

## Troubleshooting

### Common Issues on Mac

#### 1. WebGL Context Lost
**Symptoms**: 3D viewer becomes black or stops rendering
**Solution**: 
- Refresh the page
- Try Chrome or Firefox instead of Safari
- Check if other apps are using GPU resources

#### 2. Poor Performance on Safari
**Symptoms**: Slow animation, choppy playback
**Solution**:
- Use Chrome or Firefox for better performance
- Reduce the target FPS in the controls
- Close other browser tabs

#### 3. Trackpad Not Working
**Symptoms**: Can't zoom, pan, or rotate the 3D view
**Solution**:
- Ensure you're using a supported browser
- Try refreshing the page
- Check if trackpad gestures are enabled in system preferences

#### 4. App Crashes
**Symptoms**: Browser tab crashes or becomes unresponsive
**Solution**:
- Clear browser cache and cookies
- Update your browser to the latest version
- Try Chrome or Firefox instead of Safari
- Restart your browser

### Performance Tips for Mac

1. **Close Unused Apps**: Free up system resources
2. **Use Chrome**: Best performance on Mac
3. **Reduce FPS**: Lower the target FPS if experiencing slowdowns
4. **Disable Extensions**: Some browser extensions can interfere with WebGL

## Testing Mac Compatibility

Run the built-in compatibility test:

1. Open the app in your browser
2. Open Developer Tools (F12)
3. Go to Console tab
4. Run: `new MacCompatibilityTester().runAllTests()`

This will test:
- WebGL support
- Pointer Events
- Touch Events
- Performance
- Three.js compatibility

## Technical Details

### Mac-Specific Optimizations

#### WebGL Renderer Settings
```javascript
const rendererOptions = {
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
  preserveDrawingBuffer: true, // Safari needs this
  stencil: false,
  depth: true
}
```

#### Trackpad Controls
- **Zoom**: Pinch gesture or scroll wheel
- **Rotate**: Single finger drag
- **Pan**: Two finger drag or right-click drag

#### Performance Monitoring
The app automatically monitors performance and shows warnings if:
- FPS drops below 70% of target
- Frame time exceeds 20ms
- Memory usage is high

### Error Handling

The app includes comprehensive error handling:
- **Error Boundaries**: Catch React component errors
- **WebGL Context Loss**: Automatic recovery
- **Performance Warnings**: User notifications for slow performance
- **Fallback Rendering**: Graceful degradation when possible

## Browser Support Matrix

| Feature | Chrome | Firefox | Safari |
|---------|--------|---------|--------|
| WebGL | ✅ | ✅ | ✅ |
| Pointer Events | ✅ | ✅ | ✅ |
| Touch Events | ✅ | ✅ | ✅ |
| Performance | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Trackpad | ✅ | ✅ | ✅ |

## Getting Help

If you're still experiencing issues:

1. Run the compatibility test
2. Check the browser console for errors
3. Try a different browser
4. Update your browser to the latest version
5. Check if your Mac supports WebGL (most modern Macs do)

## Known Limitations

- Safari may have performance issues with complex 3D scenes
- Some older Macs may not support all WebGL features
- Trackpad sensitivity may vary between browsers
