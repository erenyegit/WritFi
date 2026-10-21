// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IOracleAdapter} from "../interfaces/IOracleAdapter.sol";

/// @title PythAccumulatorAdapter
/// @notice Settlement price source that verifies Pyth price updates itself.
///
/// Since late August 2026 Pyth signs its updates with a new guardian set and a
/// new data source. Pyth upgraded its own contracts on Ethereum, Base, Arbitrum,
/// Optimism and their testnets to accept them (contract version 1.4.6), but the
/// Pyth deployment on GIWA Sepolia (1.4.5) was not upgraded and rejects every
/// current update with InvalidWormholeVaa. This adapter performs the same checks
/// as the upgraded contracts, so settlement keeps reading real Pyth prices:
///
///  1. The update is a Pyth accumulator update ("PNAU", major version 1) whose
///     proof is a Wormhole-style VAA.
///  2. The VAA is signed by at least `quorum` members of the pinned guardian
///     set, with strictly ascending guardian indexes. Pyth's current receiver
///     (ReceiverImplementationHalf) requires n / 2 + 1 of n signatures, and so
///     does this contract.
///  3. The VAA was emitted by the pinned data source (Pythnet, chain 26).
///  4. Each price message is proven against the VAA's Merkle root.
///  5. The price is the unique first tick at or after expiry: its publishTime
///     is inside [expiry, expiry + settlementWindow] and its prevPublishTime is
///     before expiry. This is Pyth's parsePriceFeedUpdatesUnique rule, and it
///     means a settler cannot pick a favourable tick inside the window.
///
/// Every parameter is fixed at deployment. There is no owner and no setter, so
/// nobody can change which keys or which price this adapter trusts; if Pyth
/// rotates its guardians, a new adapter is deployed and WritOptions moves to it
/// through its own time-locked oracle change.
contract PythAccumulatorAdapter is IOracleAdapter {
    uint32 private constant ACCUMULATOR_MAGIC = 0x504e4155; // "PNAU"
    uint32 private constant WORMHOLE_MERKLE_MAGIC = 0x41555756; // "AUWV"
    uint8 private constant ACCUMULATOR_MAJOR_VERSION = 1;
    uint8 private constant UPDATE_TYPE_WORMHOLE_MERKLE = 0;
    uint8 private constant VAA_VERSION = 1;
    uint8 private constant MESSAGE_TYPE_PRICE_FEED = 0;
    uint8 private constant MERKLE_LEAF_PREFIX = 0;
    uint8 private constant MERKLE_NODE_PREFIX = 1;

    /// @dev message type (1) + feed id (32) + price (8) + conf (8) + expo (4)
    /// + publishTime (8) + prevPublishTime (8). Later fields are not read.
    uint256 private constant MIN_PRICE_MESSAGE_LENGTH = 69;

    bytes32 public immutable priceFeedId;
    uint32 public immutable guardianSetIndex;
    uint16 public immutable emitterChainId;
    bytes32 public immutable emitterAddress;
    uint64 public immutable settlementWindow;
    /// @notice Max accepted confidence interval, in basis points of price.
    uint64 public immutable maxConfBps;
    uint256 public immutable quorum;
    /// @notice Receives any native value callers attach (older clients paid Pyth's
    /// 1 wei update fee; this adapter charges nothing).
    address public immutable feeRecipient;

    address[] private _guardians;

    error InvalidParams();
    error InvalidUpdateData();
    error WrongGuardianSet();
    error InvalidGuardianSignature();
    error GuardianIndexesNotAscending();
    error NoQuorum();
    error WrongDataSource();
    error InvalidMerkleProof();
    error PriceNotInWindow();
    error InvalidOraclePrice();
    error ConfidenceTooWide();
    error UnsupportedExponent();

    constructor(
        bytes32 priceFeedId_,
        uint32 guardianSetIndex_,
        address[] memory guardians_,
        uint16 emitterChainId_,
        bytes32 emitterAddress_,
        uint64 settlementWindow_,
        uint64 maxConfBps_,
        address feeRecipient_
    ) {
        if (
            priceFeedId_ == bytes32(0) || guardians_.length == 0 || guardians_.length > 255
                || emitterAddress_ == bytes32(0) || settlementWindow_ == 0 || maxConfBps_ == 0
                || maxConfBps_ > 10_000 || feeRecipient_ == address(0)
        ) revert InvalidParams();

        for (uint256 i; i < guardians_.length; ++i) {
            if (guardians_[i] == address(0)) revert InvalidParams();
            // A key listed twice could sign twice and lower the real quorum.
            for (uint256 j; j < i; ++j) {
                if (guardians_[j] == guardians_[i]) revert InvalidParams();
            }
            _guardians.push(guardians_[i]);
        }

        priceFeedId = priceFeedId_;
        guardianSetIndex = guardianSetIndex_;
        emitterChainId = emitterChainId_;
        emitterAddress = emitterAddress_;
        settlementWindow = settlementWindow_;
        maxConfBps = maxConfBps_;
        quorum = guardians_.length / 2 + 1;
        feeRecipient = feeRecipient_;
    }

    // ------------------------------------------------------------- oracle

    /// @inheritdoc IOracleAdapter
    /// @dev `data` is abi.encode(bytes[] updates), each a hex-decoded Hermes
    /// update blob. The first update that yields the expiry tick is used.
    function getSettlementPrice(uint64 expiry, bytes calldata data)
        external
        payable
        returns (uint64)
    {
        bytes[] memory updates = abi.decode(data, (bytes[]));
        uint64 windowEnd = expiry + settlementWindow;

        for (uint256 i; i < updates.length; ++i) {
            Tick memory t = _findExpiryTick(updates[i], expiry, windowEnd);
            if (t.found) return _toPrice1e8(t);
        }
        revert PriceNotInWindow();
    }

    /// @notice Settlement costs no oracle fee here; kept for callers that ask.
    function getUpdateFee(bytes[] calldata) external pure returns (uint256) {
        return 0;
    }

    /// @notice Send any native value callers attached to `feeRecipient`.
    function sweep() external {
        (bool ok,) = feeRecipient.call{value: address(this).balance}("");
        if (!ok) revert InvalidParams();
    }

    function guardians() external view returns (address[] memory) {
        return _guardians;
    }

    // ------------------------------------------------------------- parsing

    struct Tick {
        bool found;
        int64 price;
        uint64 conf;
        int32 expo;
    }

    /// @dev Walks one accumulator update. Reverts on anything malformed or
    /// unverifiable; returns found = false only when the update is valid but
    /// holds no qualifying tick for this feed.
    function _findExpiryTick(bytes memory u, uint64 minTime, uint64 maxTime)
        internal
        view
        returns (Tick memory t)
    {
        uint256 o = _skipHeader(u);
        uint256 vaaLength = _u16(u, o);
        o += 2;
        bytes20 root = _verifyVaa(u, o, vaaLength);
        o += vaaLength;

        uint256 numMessages = _u8(u, o);
        o += 1;
        for (uint256 k; k < numMessages; ++k) {
            uint256 start;
            uint256 length;
            (o, start, length) = _provenMessage(u, o, root);
            _readTick(u, start, length, minTime, maxTime, t);
        }
    }

    /// @dev Checks magic and version and returns the offset of the VAA length.
    function _skipHeader(bytes memory u) internal pure returns (uint256 o) {
        if (_u32(u, 0) != ACCUMULATOR_MAGIC) revert InvalidUpdateData();
        if (_u8(u, 4) != ACCUMULATOR_MAJOR_VERSION) revert InvalidUpdateData();
        // Minor versions are forward compatible, as in Pyth's own parser.
        o = 6;
        o += 1 + _u8(u, o); // trailing header, reserved for future fields
        if (_u8(u, o) != UPDATE_TYPE_WORMHOLE_MERKLE) revert InvalidUpdateData();
        o += 1;
    }

    /// @dev Proves the message at `o` against `root`; returns where it starts,
    /// how long it is, and the offset after its proof.
    function _provenMessage(bytes memory u, uint256 o, bytes20 root)
        internal
        pure
        returns (uint256 next, uint256 start, uint256 length)
    {
        length = _u16(u, o);
        start = o + 2;
        next = start + length;
        if (next > u.length) revert InvalidUpdateData();

        bytes20 digest = _leafHash(u, start, length);
        uint256 proofLength = _u8(u, next);
        next += 1;
        for (uint256 p; p < proofLength; ++p) {
            digest = _nodeHash(digest, _b20(u, next));
            next += 20;
        }
        if (digest != root) revert InvalidMerkleProof();
    }

    /// @dev Fills `t` from a proven price message if it is this feed's unique
    /// first tick at or after `minTime` and no earlier message already was.
    function _readTick(
        bytes memory u,
        uint256 start,
        uint256 length,
        uint64 minTime,
        uint64 maxTime,
        Tick memory t
    ) internal view {
        if (length < MIN_PRICE_MESSAGE_LENGTH) revert InvalidUpdateData();
        if (_u8(u, start) != MESSAGE_TYPE_PRICE_FEED) revert InvalidUpdateData();
        if (t.found || _b32(u, start + 1) != priceFeedId) return;

        uint64 publishTime = _u64(u, start + 53);
        uint64 prevPublishTime = _u64(u, start + 61);
        if (publishTime < minTime || publishTime > maxTime || prevPublishTime >= minTime) return;

        t.found = true;
        t.price = int64(_u64(u, start + 33));
        t.conf = _u64(u, start + 41);
        t.expo = int32(_u32(u, start + 49));
    }

    /// @dev Verifies guardian signatures and the data source of the VAA at
    /// `u[start : start + length]`, and returns the Merkle root it carries.
    function _verifyVaa(bytes memory u, uint256 start, uint256 length)
        internal
        view
        returns (bytes20)
    {
        uint256 end = start + length;
        if (end > u.length) revert InvalidUpdateData();
        if (_u8(u, start) != VAA_VERSION) revert InvalidUpdateData();
        if (_u32(u, start + 1) != guardianSetIndex) revert WrongGuardianSet();

        uint256 numSignatures = _u8(u, start + 5);
        uint256 bodyStart = start + 6 + numSignatures * 66;
        if (bodyStart >= end) revert InvalidUpdateData();
        if (numSignatures < quorum) revert NoQuorum();

        bytes32 digest;
        assembly {
            let bodyHash := keccak256(add(add(u, 32), bodyStart), sub(end, bodyStart))
            mstore(0x00, bodyHash)
            digest := keccak256(0x00, 32)
        }
        _checkSignatures(u, start + 6, numSignatures, digest);
        return _payloadRoot(u, bodyStart, end);
    }

    /// @dev Each signature must come from the guardian at its stated index, and
    /// indexes must strictly ascend so no guardian is counted twice.
    function _checkSignatures(bytes memory u, uint256 at, uint256 count, bytes32 digest)
        internal
        view
    {
        uint256 lastIndex;
        for (uint256 i; i < count; ++i) {
            uint256 index = _u8(u, at);
            if (i != 0 && index <= lastIndex) revert GuardianIndexesNotAscending();
            if (index >= _guardians.length) revert InvalidGuardianSignature();
            address signer = ecrecover(digest, _u8(u, at + 65) + 27, _b32(u, at + 1), _b32(u, at + 33));
            if (signer == address(0) || signer != _guardians[index]) {
                revert InvalidGuardianSignature();
            }
            lastIndex = index;
            at += 66;
        }
    }

    /// @dev Body: timestamp (4) nonce (4) emitterChain (2) emitterAddress (32)
    /// sequence (8) consistency (1), then the payload: magic (4) update type (1)
    /// slot (8) ring size (4) root (20).
    function _payloadRoot(bytes memory u, uint256 bodyStart, uint256 end)
        internal
        view
        returns (bytes20)
    {
        if (bodyStart + 51 > end) revert InvalidUpdateData();
        if (_u16(u, bodyStart + 8) != emitterChainId || _b32(u, bodyStart + 10) != emitterAddress) {
            revert WrongDataSource();
        }
        uint256 payload = bodyStart + 51;
        if (payload + 37 > end) revert InvalidUpdateData();
        if (_u32(u, payload) != WORMHOLE_MERKLE_MAGIC) revert InvalidUpdateData();
        if (_u8(u, payload + 4) != UPDATE_TYPE_WORMHOLE_MERKLE) revert InvalidUpdateData();
        return _b20(u, payload + 17);
    }

    // ------------------------------------------------------------- price

    function _toPrice1e8(Tick memory t) internal view returns (uint64) {
        if (t.price <= 0) revert InvalidOraclePrice();
        uint256 raw = uint256(uint64(t.price));
        if (uint256(t.conf) * 10_000 > raw * maxConfBps) revert ConfidenceTooWide();

        int256 e = int256(t.expo);
        if (e > 0 || e < -18) revert UnsupportedExponent();
        uint256 scaled = e >= -8 ? raw * 10 ** uint256(e + 8) : raw / 10 ** uint256(-8 - e);
        if (scaled == 0 || scaled > type(uint64).max) revert InvalidOraclePrice();
        return uint64(scaled);
    }

    // ------------------------------------------------------------- merkle

    function _leafHash(bytes memory u, uint256 start, uint256 length)
        internal
        pure
        returns (bytes20 h)
    {
        bytes memory leaf = new bytes(length + 1);
        leaf[0] = bytes1(MERKLE_LEAF_PREFIX);
        for (uint256 i; i < length; ++i) {
            leaf[i + 1] = u[start + i];
        }
        h = bytes20(keccak256(leaf));
    }

    function _nodeHash(bytes20 a, bytes20 b) internal pure returns (bytes20) {
        if (a > b) (a, b) = (b, a);
        return bytes20(keccak256(abi.encodePacked(MERKLE_NODE_PREFIX, a, b)));
    }

    // ------------------------------------------------------------- reads
    //
    // Big-endian reads with a bounds check each. Every length in the format is
    // attacker controlled, so no read may run past the buffer.

    function _word(bytes memory u, uint256 o, uint256 size) private pure returns (uint256 w) {
        if (o + size > u.length) revert InvalidUpdateData();
        assembly {
            w := mload(add(add(u, 32), o))
        }
    }

    function _u8(bytes memory u, uint256 o) private pure returns (uint8) {
        return uint8(_word(u, o, 1) >> 248);
    }

    function _u16(bytes memory u, uint256 o) private pure returns (uint16) {
        return uint16(_word(u, o, 2) >> 240);
    }

    function _u32(bytes memory u, uint256 o) private pure returns (uint32) {
        return uint32(_word(u, o, 4) >> 224);
    }

    function _u64(bytes memory u, uint256 o) private pure returns (uint64) {
        return uint64(_word(u, o, 8) >> 192);
    }

    function _b20(bytes memory u, uint256 o) private pure returns (bytes20) {
        return bytes20(bytes32(_word(u, o, 20)));
    }

    function _b32(bytes memory u, uint256 o) private pure returns (bytes32) {
        return bytes32(_word(u, o, 32));
    }
}
