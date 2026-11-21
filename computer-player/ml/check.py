import argparse
import json
import torch


def profile(vram_mib):
    large = vram_mib >= 12000
    return dict(width=64 if large else 32, batch_size=128 if large else 32,
                mixed_precision=vram_mib > 0)


def device_info(device='cuda'):
    available = torch.cuda.is_available()
    if device == 'cuda' and not available:
        raise RuntimeError('CUDA requested but unavailable; use --device cpu for tests')
    info = dict(torch=str(torch.__version__), cuda_available=available, cuda_runtime=torch.version.cuda, device=device)
    vram = 0
    if available:
        props = torch.cuda.get_device_properties(0)
        vram = props.total_memory // 1048576
        info.update(name=props.name, vram_mib=vram, capability=list(torch.cuda.get_device_capability(0)))
    info['profile'] = profile(vram if device == 'cuda' else 0)
    return info


def memory_budget(device, fraction):
    if not 0 < fraction <= 1:
        raise ValueError('GPU memory fraction must be in (0, 1]')
    if device == 'cuda':
        torch.cuda.set_per_process_memory_fraction(fraction)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    args = parser.parse_args()
    info = device_info(args.device)
    matrix = torch.ones((64, 64), device=args.device)
    assert torch.allclose(matrix @ matrix, matrix * 64)
    print(json.dumps(info))
